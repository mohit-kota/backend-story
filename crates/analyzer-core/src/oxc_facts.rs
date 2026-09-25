use std::path::Path;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, CallExpression, Class, Expression, Function, IdentifierReference, ImportDeclaration,
    MethodDefinition, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};
use oxc_syntax::scope::ScopeFlags;

use crate::model::{
    CallFact, DiagnosticSeverity, FileAnalysis, FileMetrics, ParserDiagnostic, RouteFact,
    SourceSpan, SymbolFact, SymbolKind,
};

pub(crate) fn analyze_script(
    absolute_path: &Path,
    relative_path: &str,
    source_text: &str,
    content_hash: String,
) -> FileAnalysis {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(absolute_path).unwrap_or_default();
    let parser_return = Parser::new(&allocator, source_text, source_type).parse();

    let diagnostics = parser_return
        .diagnostics
        .into_iter()
        .map(|diagnostic| ParserDiagnostic {
            message: diagnostic.to_string(),
            severity: DiagnosticSeverity::Error,
            span: None,
        })
        .collect();

    let mut collector = FactCollector::new(relative_path, source_text);
    collector.visit_program(&parser_return.program);

    for route in &mut collector.routes {
        route.middleware.sort();
        route.middleware.dedup();
        route.schema_refs.sort();
        route.schema_refs.dedup();
        route.calls.sort_by_key(|call| call.span.start);
        route.calls.dedup_by(|left, right| {
            left.callee == right.callee && left.span.start == right.span.start
        });
    }

    let metrics = FileMetrics {
        imports: collector.imports.len(),
        functions: collector.functions,
        classes: collector.classes,
        calls: collector.calls.len(),
        routes: collector.routes.len(),
        prisma_models: 0,
        prisma_enums: 0,
    };

    FileAnalysis {
        id: format!("file:{relative_path}"),
        path: relative_path.to_owned(),
        language: source_type_label(absolute_path).to_owned(),
        content_hash,
        byte_length: source_text.len() as u64,
        imports: collector.imports,
        symbols: collector.symbols,
        calls: collector.calls,
        routes: collector.routes,
        diagnostics,
        metrics,
    }
}

struct FactCollector<'source> {
    relative_path: &'source str,
    source_text: &'source str,
    line_starts: Vec<u32>,
    imports: Vec<String>,
    symbols: Vec<SymbolFact>,
    calls: Vec<CallFact>,
    routes: Vec<RouteFact>,
    functions: usize,
    classes: usize,
    path_prefixes: Vec<String>,
    middleware: Vec<String>,
    route_stack: Vec<usize>,
    class_stack: Vec<String>,
    owner_stack: Vec<String>,
}

impl<'source> FactCollector<'source> {
    fn new(relative_path: &'source str, source_text: &'source str) -> Self {
        let mut line_starts = vec![0];
        for (index, byte) in source_text.bytes().enumerate() {
            if byte == b'\n' {
                line_starts.push(index as u32 + 1);
            }
        }

        Self {
            relative_path,
            source_text,
            line_starts,
            imports: Vec::new(),
            symbols: Vec::new(),
            calls: Vec::new(),
            routes: Vec::new(),
            functions: 0,
            classes: 0,
            path_prefixes: Vec::new(),
            middleware: Vec::new(),
            route_stack: Vec::new(),
            class_stack: Vec::new(),
            owner_stack: Vec::new(),
        }
    }

    fn line_for_offset(&self, offset: u32) -> u32 {
        self.line_starts.partition_point(|start| *start <= offset) as u32
    }

    fn source_span(&self, span: Span) -> SourceSpan {
        SourceSpan {
            start: span.start,
            end: span.end,
            start_line: Some(self.line_for_offset(span.start)),
            end_line: Some(self.line_for_offset(span.end.saturating_sub(1))),
        }
    }

    fn source_slice(&self, span: Span) -> &'source str {
        self.source_text
            .get(span.start as usize..span.end as usize)
            .unwrap_or_default()
    }

    fn add_symbol(&mut self, name: &str, kind: SymbolKind, span: Span) {
        let kind_label = match kind {
            SymbolKind::Function => "function",
            SymbolKind::Class => "class",
            SymbolKind::Method => "method",
            SymbolKind::Schema => "schema",
            SymbolKind::PrismaModel => "prisma-model",
            SymbolKind::PrismaEnum => "prisma-enum",
        };

        self.symbols.push(SymbolFact {
            id: format!(
                "symbol:{}:{kind_label}:{name}:{}",
                self.relative_path, span.start
            ),
            name: name.to_owned(),
            kind,
            span: self.source_span(span),
        });
    }

    fn current_path(&self, route_path: &str) -> String {
        let mut path = self.path_prefixes.join("");
        path.push_str(route_path);
        if path.is_empty() {
            "/".to_owned()
        } else if path.starts_with('/') {
            path
        } else {
            format!("/{path}")
        }
    }

    fn add_call(&mut self, call: &CallExpression<'_>) {
        let callee = compact_source(self.source_slice(call.callee.span()));
        if callee.is_empty() {
            return;
        }

        let fact = CallFact {
            id: format!("call:{}:{}:{callee}", self.relative_path, call.span.start),
            callee,
            expression: self.source_slice(call.span).trim().to_owned(),
            owner: self.owner_stack.last().cloned(),
            span: self.source_span(call.span),
        };
        self.calls.push(fact.clone());
        if let Some(route_index) = self.route_stack.last().copied() {
            self.routes[route_index].calls.push(fact);
        }
    }

    fn begin_route(
        &mut self,
        call: &CallExpression<'_>,
        method: &str,
        path: &str,
        route_start: u32,
    ) -> usize {
        let full_path = self.current_path(path);
        let route_span = self.source_span(Span::new(route_start, call.span.end));
        let handler_span = call
            .arguments
            .get(1)
            .map(|argument| self.source_span(argument.span()));
        let summary = call
            .arguments
            .get(2)
            .and_then(|argument| extract_summary(self.source_slice(argument.span())));
        let index = self.routes.len();
        self.routes.push(RouteFact {
            id: format!(
                "contract:{}:{}:{}:{}",
                self.relative_path, method, full_path, route_start
            ),
            method: method.to_ascii_uppercase(),
            path: full_path,
            summary,
            span: route_span,
            handler_span,
            middleware: self.middleware.clone(),
            schema_refs: Vec::new(),
            calls: Vec::new(),
        });
        index
    }
}

impl<'ast> Visit<'ast> for FactCollector<'_> {
    fn visit_import_declaration(&mut self, declaration: &ImportDeclaration<'ast>) {
        self.imports.push(declaration.source.value.to_string());
        walk::walk_import_declaration(self, declaration);
    }

    fn visit_function(&mut self, function: &Function<'ast>, flags: ScopeFlags) {
        self.functions += 1;
        if let Some(identifier) = &function.id {
            let name = identifier.name.as_str().to_owned();
            self.add_symbol(&name, SymbolKind::Function, function.span);
            self.owner_stack.push(name);
            walk::walk_function(self, function, flags);
            self.owner_stack.pop();
            return;
        }
        walk::walk_function(self, function, flags);
    }

    fn visit_class(&mut self, class: &Class<'ast>) {
        self.classes += 1;
        let class_name = class
            .id
            .as_ref()
            .map(|identifier| identifier.name.to_string());
        if let Some(name) = &class_name {
            self.add_symbol(name, SymbolKind::Class, class.span);
            self.class_stack.push(name.clone());
        }
        walk::walk_class(self, class);
        if class_name.is_some() {
            self.class_stack.pop();
        }
    }

    fn visit_method_definition(&mut self, method: &MethodDefinition<'ast>) {
        let Some(method_name) = method.key.static_name() else {
            walk::walk_method_definition(self, method);
            return;
        };
        let qualified_name = self.class_stack.last().map_or_else(
            || method_name.to_string(),
            |class| format!("{class}.{method_name}"),
        );
        self.add_symbol(&qualified_name, SymbolKind::Method, method.span);
        self.owner_stack.push(qualified_name);
        walk::walk_method_definition(self, method);
        self.owner_stack.pop();
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'ast>) {
        if let (Some(identifier), Some(initializer)) = (
            declarator.id.get_binding_identifier(),
            declarator.init.as_ref(),
        ) {
            let initializer_source = self.source_slice(initializer.span());
            if looks_like_schema(initializer_source) {
                self.add_symbol(
                    identifier.name.as_str(),
                    SymbolKind::Schema,
                    declarator.span,
                );
            }
        }
        walk::walk_variable_declarator(self, declarator);
    }

    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'ast>) {
        if let Some(route_index) = self.route_stack.last().copied() {
            let name = identifier.name.as_str();
            if name.chars().next().is_some_and(char::is_uppercase) {
                self.routes[route_index].schema_refs.push(name.to_owned());
            }
        }
        walk::walk_identifier_reference(self, identifier);
    }

    fn visit_call_expression(&mut self, call: &CallExpression<'ast>) {
        let Expression::StaticMemberExpression(member) = &call.callee else {
            self.add_call(call);
            walk::walk_call_expression(self, call);
            return;
        };

        let method = member.property.name.as_str();
        let static_path = match call.arguments.first() {
            Some(Argument::StringLiteral(path)) => Some(path.value.as_str()),
            _ => None,
        };

        if method == "group" {
            let path = static_path.unwrap_or_default().to_owned();
            let chain_source = self.source_slice(call.callee.span());
            let chain_middleware = extract_chain_middleware(chain_source);
            let added_middleware = chain_middleware.len();
            self.middleware.extend(chain_middleware);
            self.path_prefixes.push(path);
            walk::walk_call_expression(self, call);
            self.path_prefixes.pop();
            self.middleware
                .truncate(self.middleware.len().saturating_sub(added_middleware));
            return;
        }

        if method == "use" {
            let middleware = call
                .arguments
                .first()
                .map(|argument| compact_source(self.source_slice(argument.span())))
                .filter(|name| !name.is_empty());
            if let Some(name) = middleware {
                self.middleware.push(name);
                walk::walk_call_expression(self, call);
                self.middleware.pop();
            } else {
                walk::walk_call_expression(self, call);
            }
            return;
        }

        if let Some(path) = static_path
            && matches!(method, "get" | "post" | "put" | "patch" | "delete")
        {
            let route_index = self.begin_route(call, method, path, member.property.span.start);
            self.route_stack.push(route_index);
            walk::walk_call_expression(self, call);
            self.route_stack.pop();
            return;
        }

        self.add_call(call);
        walk::walk_call_expression(self, call);
    }
}

fn compact_source(source: &str) -> String {
    source
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect()
}

fn looks_like_schema(source: &str) -> bool {
    let source = source.trim_start();
    source.starts_with("t.")
        || source.contains("t.Object(")
        || source.contains("t.Composite(")
        || source.contains("t.Union(")
        || source.contains("t.Array(")
}

fn extract_chain_middleware(source: &str) -> Vec<String> {
    let mut middleware = Vec::new();
    let mut remaining = source;
    while let Some(index) = remaining.find(".use(") {
        remaining = &remaining[index + 5..];
        let Some(end) = remaining.find(')') else {
            break;
        };
        let name = compact_source(&remaining[..end]);
        if !name.is_empty() {
            middleware.push(name);
        }
        remaining = &remaining[end + 1..];
    }
    middleware
}

fn extract_summary(source: &str) -> Option<String> {
    let summary_index = source.find("summary")?;
    let after_summary = &source[summary_index + "summary".len()..];
    let colon_index = after_summary.find(':')?;
    let value = after_summary[colon_index + 1..].trim_start();
    let quote = value.chars().next()?;
    if !matches!(quote, '\'' | '"' | '`') {
        return None;
    }
    let rest = &value[quote.len_utf8()..];
    let end = rest.find(quote)?;
    Some(rest[..end].trim().to_owned())
}

fn source_type_label(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("ts" | "mts" | "cts") => "TypeScript",
        Some("tsx") => "TypeScript JSX",
        Some("jsx") => "JavaScript JSX",
        Some("js" | "mjs" | "cjs") => "JavaScript",
        _ => "ECMAScript",
    }
}
