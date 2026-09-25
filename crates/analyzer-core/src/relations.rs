use std::collections::{HashMap, HashSet};

use crate::model::{
    ApiContract, CallFact, ContractEdge, ContractEdgeKind, ContractNode, ContractNodeKind,
    DataAccessFact, DataAccessKind, FileAnalysis, RouteFact, SourceSpan, SymbolKind,
};
use crate::sql_interpreter::interpret_prisma_call;

const MAX_CONTRACT_NODES: usize = 80;
const MAX_CALLS_PER_SYMBOL: usize = 32;
const MAX_EXPANSION_DEPTH: usize = 2;

#[derive(Clone)]
struct SymbolLocation {
    file_path: String,
    span: SourceSpan,
    kind: SymbolKind,
}

pub(crate) fn build_contracts(files: &[FileAnalysis]) -> Vec<ApiContract> {
    let symbols = index_symbols(files);
    let prisma_models = index_prisma_models(files);
    let mut contracts = Vec::new();

    for file in files {
        for route in &file.routes {
            contracts.push(build_contract(file, route, files, &symbols, &prisma_models));
        }
    }

    contracts.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then(left.method.cmp(&right.method))
            .then(left.file_path.cmp(&right.file_path))
    });
    contracts
}

fn index_symbols(files: &[FileAnalysis]) -> HashMap<String, SymbolLocation> {
    let mut symbols = HashMap::new();
    for file in files {
        for symbol in &file.symbols {
            symbols
                .entry(symbol.name.clone())
                .or_insert_with(|| SymbolLocation {
                    file_path: file.path.clone(),
                    span: symbol.span,
                    kind: symbol.kind,
                });
        }
    }
    symbols
}

fn index_prisma_models(files: &[FileAnalysis]) -> HashMap<String, SymbolLocation> {
    let mut models = HashMap::new();
    for file in files {
        for symbol in &file.symbols {
            if matches!(symbol.kind, SymbolKind::PrismaModel) {
                models.insert(
                    symbol.name.to_ascii_lowercase(),
                    SymbolLocation {
                        file_path: file.path.clone(),
                        span: symbol.span,
                        kind: symbol.kind,
                    },
                );
            }
        }
    }
    models
}

fn build_contract(
    route_file: &FileAnalysis,
    route: &RouteFact,
    files: &[FileAnalysis],
    symbols: &HashMap<String, SymbolLocation>,
    prisma_models: &HashMap<String, SymbolLocation>,
) -> ApiContract {
    let mut graph = ContractGraph::new(route.id.clone());
    let endpoint_id = graph.add_node(
        "endpoint",
        format!("{} {}", route.method, route.path),
        route
            .summary
            .clone()
            .unwrap_or_else(|| "API contract".to_owned()),
        ContractNodeKind::Endpoint,
        Some(route_file.path.clone()),
        Some(route.span),
    );

    let mut invocation_origin = endpoint_id.clone();
    for (index, middleware) in route.middleware.iter().take(8).enumerate() {
        let middleware_id = graph.add_node(
            &format!("middleware:{index}:{middleware}"),
            middleware.clone(),
            middleware_detail(middleware),
            ContractNodeKind::Middleware,
            Some(route_file.path.clone()),
            route.handler_span,
        );
        graph.add_edge(
            &invocation_origin,
            &middleware_id,
            ContractEdgeKind::Guards,
            "guards",
        );
        invocation_origin = middleware_id;
    }

    for schema_name in route.schema_refs.iter().take(16) {
        let Some(location) = symbols.get(schema_name) else {
            continue;
        };
        if !matches!(location.kind, SymbolKind::Schema) {
            continue;
        }
        let schema_id = graph.add_node(
            &format!("schema:{schema_name}"),
            schema_name.clone(),
            schema_detail(schema_name),
            ContractNodeKind::Schema,
            Some(location.file_path.clone()),
            Some(location.span),
        );
        if is_response_schema(schema_name) {
            graph.add_edge(
                &endpoint_id,
                &schema_id,
                ContractEdgeKind::Returns,
                "returns",
            );
        } else {
            graph.add_edge(
                &schema_id,
                &endpoint_id,
                ContractEdgeKind::UsesSchema,
                "validates",
            );
        }
    }

    let mut expanded = HashSet::new();
    for call in meaningful_calls(&route.calls, symbols).into_iter().take(12) {
        if graph.is_full() {
            break;
        }
        let Some(location) = symbols.get(&call.callee) else {
            continue;
        };
        let kind = match location.kind {
            SymbolKind::Method | SymbolKind::Class => ContractNodeKind::Service,
            _ => ContractNodeKind::Helper,
        };
        let node_id = graph.add_node(
            &format!("symbol:{}", call.callee),
            call.callee.clone(),
            symbol_detail(location.kind),
            kind,
            Some(location.file_path.clone()),
            Some(location.span),
        );
        graph.add_edge(
            &invocation_origin,
            &node_id,
            ContractEdgeKind::Invokes,
            "invokes",
        );
        expand_symbol(
            &call.callee,
            &node_id,
            files,
            symbols,
            prisma_models,
            &mut graph,
            &mut expanded,
            0,
        );
    }

    for call in &route.calls {
        if let Some((model, operation, access)) = parse_prisma_call(&call.callee) {
            add_database_relation(
                &invocation_origin,
                route_file,
                call,
                model,
                operation,
                access,
                prisma_models,
                &mut graph,
            );
        }
    }

    ApiContract {
        id: route.id.clone(),
        method: route.method.clone(),
        path: route.path.clone(),
        summary: route.summary.clone(),
        file_path: route_file.path.clone(),
        span: route.span,
        nodes: graph.nodes,
        edges: graph.edges,
    }
}

#[allow(clippy::too_many_arguments)]
fn expand_symbol(
    symbol_name: &str,
    parent_node_id: &str,
    files: &[FileAnalysis],
    symbols: &HashMap<String, SymbolLocation>,
    prisma_models: &HashMap<String, SymbolLocation>,
    graph: &mut ContractGraph,
    expanded: &mut HashSet<String>,
    depth: usize,
) {
    if depth > MAX_EXPANSION_DEPTH || graph.is_full() || !expanded.insert(symbol_name.to_owned()) {
        return;
    }

    for file in files {
        let mut calls = file
            .calls
            .iter()
            .filter(|call| call.owner.as_deref() == Some(symbol_name))
            .collect::<Vec<_>>();
        calls.sort_by_key(|call| call.span.start);

        for call in calls.into_iter().take(MAX_CALLS_PER_SYMBOL) {
            if graph.is_full() {
                break;
            }
            if let Some((model, operation, access)) = parse_prisma_call(&call.callee) {
                add_database_relation(
                    parent_node_id,
                    file,
                    call,
                    model,
                    operation,
                    access,
                    prisma_models,
                    graph,
                );
                continue;
            }

            let Some(location) = symbols.get(&call.callee) else {
                continue;
            };
            if !matches!(location.kind, SymbolKind::Method | SymbolKind::Function) {
                continue;
            }
            let kind = if matches!(location.kind, SymbolKind::Method) {
                ContractNodeKind::Service
            } else {
                ContractNodeKind::Helper
            };
            let child_id = graph.add_node(
                &format!("symbol:{}", call.callee),
                call.callee.clone(),
                symbol_detail(location.kind),
                kind,
                Some(location.file_path.clone()),
                Some(location.span),
            );
            graph.add_edge(
                parent_node_id,
                &child_id,
                ContractEdgeKind::Invokes,
                "invokes",
            );
            expand_symbol(
                &call.callee,
                &child_id,
                files,
                symbols,
                prisma_models,
                graph,
                expanded,
                depth + 1,
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn add_database_relation(
    parent_node_id: &str,
    source_file: &FileAnalysis,
    call: &CallFact,
    model: &str,
    operation: &str,
    access: ContractEdgeKind,
    prisma_models: &HashMap<String, SymbolLocation>,
    graph: &mut ContractGraph,
) {
    let db_id = graph.add_node(
        &format!(
            "database:{}:{model}:{operation}:{}",
            source_file.path, call.span.start
        ),
        format!("{model}.{operation}"),
        database_detail(model, operation, access),
        ContractNodeKind::Database,
        Some(source_file.path.clone()),
        Some(call.span),
    );
    graph.attach_data_access(
        &db_id,
        DataAccessFact {
            model: model.to_owned(),
            operation: operation.to_owned(),
            access: if matches!(access, ContractEdgeKind::Writes) {
                DataAccessKind::Write
            } else {
                DataAccessKind::Read
            },
            fingerprint: exact_query_fingerprint(&call.expression),
            shape_fingerprint: format!(
                "{}:{}",
                model.to_ascii_lowercase(),
                operation.to_ascii_lowercase()
            ),
            expression: call.expression.clone(),
            interpreted_sql: interpret_prisma_call(model, operation, &call.expression),
            sql_evidence: None,
        },
    );
    graph.add_edge(
        parent_node_id,
        &db_id,
        access,
        if matches!(access, ContractEdgeKind::Writes) {
            "writes"
        } else {
            "reads"
        },
    );

    if let Some(location) = prisma_models.get(&model.to_ascii_lowercase()) {
        let model_id = graph.add_node(
            &format!("prisma-model:{model}"),
            format!("{} model", title_case(model)),
            "Prisma data model".to_owned(),
            ContractNodeKind::Schema,
            Some(location.file_path.clone()),
            Some(location.span),
        );
        graph.add_edge(&db_id, &model_id, ContractEdgeKind::UsesSchema, "model");
    }
}

fn meaningful_calls<'a>(
    calls: &'a [CallFact],
    symbols: &HashMap<String, SymbolLocation>,
) -> Vec<&'a CallFact> {
    let mut result = calls
        .iter()
        .filter(|call| {
            symbols.get(&call.callee).is_some_and(|location| {
                matches!(location.kind, SymbolKind::Method | SymbolKind::Function)
            })
        })
        .collect::<Vec<_>>();
    result.sort_by_key(|call| call.span.start);
    result.dedup_by(|left, right| left.callee == right.callee);
    result
}

fn parse_prisma_call(callee: &str) -> Option<(&str, &str, ContractEdgeKind)> {
    let mut parts = callee.strip_prefix("prisma.")?.split('.');
    let model = parts.next()?;
    let operation = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    let access = if matches!(
        operation,
        "create" | "createMany" | "update" | "updateMany" | "upsert" | "delete" | "deleteMany"
    ) {
        ContractEdgeKind::Writes
    } else {
        ContractEdgeKind::Reads
    };
    Some((model, operation, access))
}

fn is_response_schema(name: &str) -> bool {
    name.contains("Response") || name.ends_with("Result")
}

fn schema_detail(name: &str) -> String {
    if is_response_schema(name) {
        "Response contract".to_owned()
    } else if name.contains("Query") {
        "Query contract".to_owned()
    } else if name.contains("Params") {
        "Path parameter contract".to_owned()
    } else {
        "Request contract".to_owned()
    }
}

fn middleware_detail(name: &str) -> String {
    if name.contains("AdminAuth") {
        "Platform admin authorization".to_owned()
    } else if name.contains("Auth") {
        "Authentication and session guard".to_owned()
    } else if name.to_ascii_lowercase().contains("rate") {
        "Request rate limit".to_owned()
    } else {
        "Request middleware".to_owned()
    }
}

fn symbol_detail(kind: SymbolKind) -> String {
    match kind {
        SymbolKind::Method => "Service method".to_owned(),
        SymbolKind::Function => "Internal helper".to_owned(),
        _ => "Code symbol".to_owned(),
    }
}

fn database_detail(model: &str, operation: &str, access: ContractEdgeKind) -> String {
    let action = if matches!(access, ContractEdgeKind::Writes) {
        "Mutates"
    } else {
        "Reads"
    };
    format!(
        "{action} the {} model via Prisma `{operation}`",
        title_case(model)
    )
}

fn exact_query_fingerprint(expression: &str) -> String {
    let normalized = normalize_query_expression(expression);
    format!("prisma:{}", blake3::hash(normalized.as_bytes()).to_hex())
}

fn normalize_query_expression(expression: &str) -> String {
    let mut normalized = String::with_capacity(expression.len());
    let mut quote = None;
    let mut escaped = false;

    for character in expression.chars() {
        if let Some(active_quote) = quote {
            normalized.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == active_quote {
                quote = None;
            }
            continue;
        }

        if matches!(character, '\'' | '"' | '`') {
            quote = Some(character);
            normalized.push(character);
        } else if !character.is_whitespace() {
            normalized.push(character);
        }
    }

    normalized
        .replace(",}", "}")
        .replace(",]", "]")
        .replace(",)", ")")
}

fn title_case(value: &str) -> String {
    let mut characters = value.chars();
    characters.next().map_or_else(String::new, |first| {
        first.to_uppercase().collect::<String>() + characters.as_str()
    })
}

struct ContractGraph {
    contract_id: String,
    nodes: Vec<ContractNode>,
    edges: Vec<ContractEdge>,
    node_ids: HashMap<String, String>,
}

impl ContractGraph {
    fn new(contract_id: String) -> Self {
        Self {
            contract_id,
            nodes: Vec::new(),
            edges: Vec::new(),
            node_ids: HashMap::new(),
        }
    }

    fn add_node(
        &mut self,
        key: &str,
        label: String,
        detail: String,
        kind: ContractNodeKind,
        file_path: Option<String>,
        span: Option<SourceSpan>,
    ) -> String {
        if let Some(id) = self.node_ids.get(key) {
            return id.clone();
        }
        let id = format!("{}:node:{}", self.contract_id, self.nodes.len());
        self.node_ids.insert(key.to_owned(), id.clone());
        self.nodes.push(ContractNode {
            id: id.clone(),
            label,
            detail,
            kind,
            file_path,
            span,
            order: self.nodes.len(),
            data_access: None,
        });
        id
    }

    fn attach_data_access(&mut self, node_id: &str, data_access: DataAccessFact) {
        if let Some(node) = self.nodes.iter_mut().find(|node| node.id == node_id) {
            node.data_access = Some(data_access);
        }
    }

    fn is_full(&self) -> bool {
        self.nodes.len() >= MAX_CONTRACT_NODES
    }

    fn add_edge(&mut self, source: &str, target: &str, kind: ContractEdgeKind, label: &str) {
        if source == target
            || self
                .edges
                .iter()
                .any(|edge| edge.source == source && edge.target == target && edge.kind == kind)
        {
            return;
        }
        self.edges.push(ContractEdge {
            id: format!("{}:edge:{}", self.contract_id, self.edges.len()),
            source: source.to_owned(),
            target: target.to_owned(),
            kind,
            label: label.to_owned(),
        });
    }
}
