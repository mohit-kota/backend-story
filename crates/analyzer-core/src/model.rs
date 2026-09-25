use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisReport {
    pub root: String,
    pub analyzed_at_unix_ms: u64,
    pub summary: AnalysisSummary,
    #[serde(skip)]
    pub files: Vec<FileAnalysis>,
    pub contracts: Vec<ApiContract>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSummary {
    pub total_files: usize,
    pub parsed_files: usize,
    pub failed_files: usize,
    pub total_bytes: u64,
    pub imports: usize,
    pub functions: usize,
    pub classes: usize,
    pub calls: usize,
    pub routes: usize,
    pub prisma_models: usize,
    pub prisma_enums: usize,
    pub diagnostics: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAnalysis {
    pub id: String,
    pub path: String,
    pub language: String,
    pub content_hash: String,
    pub byte_length: u64,
    pub imports: Vec<String>,
    pub symbols: Vec<SymbolFact>,
    #[serde(skip)]
    pub calls: Vec<CallFact>,
    #[serde(skip)]
    pub routes: Vec<RouteFact>,
    pub diagnostics: Vec<ParserDiagnostic>,
    pub metrics: FileMetrics,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetrics {
    pub imports: usize,
    pub functions: usize,
    pub classes: usize,
    pub calls: usize,
    pub routes: usize,
    pub prisma_models: usize,
    pub prisma_enums: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolFact {
    pub id: String,
    pub name: String,
    pub kind: SymbolKind,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SymbolKind {
    Function,
    Class,
    Method,
    Schema,
    PrismaModel,
    PrismaEnum,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallFact {
    pub id: String,
    pub callee: String,
    pub expression: String,
    pub owner: Option<String>,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteFact {
    pub id: String,
    pub method: String,
    pub path: String,
    pub summary: Option<String>,
    pub span: SourceSpan,
    pub handler_span: Option<SourceSpan>,
    pub middleware: Vec<String>,
    pub schema_refs: Vec<String>,
    pub calls: Vec<CallFact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiContract {
    pub id: String,
    pub method: String,
    pub path: String,
    pub summary: Option<String>,
    pub file_path: String,
    pub span: SourceSpan,
    pub nodes: Vec<ContractNode>,
    pub edges: Vec<ContractEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractNode {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub kind: ContractNodeKind,
    pub file_path: Option<String>,
    pub span: Option<SourceSpan>,
    pub order: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_access: Option<DataAccessFact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataAccessFact {
    pub model: String,
    pub operation: String,
    pub access: DataAccessKind,
    pub fingerprint: String,
    pub shape_fingerprint: String,
    pub expression: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interpreted_sql: Option<InterpretedSql>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql_evidence: Option<ObservedSqlEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedSql {
    pub statement: String,
    pub limitations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservedSqlEvidence {
    pub statement: String,
    pub normalized_statement: String,
    pub fingerprint: String,
    pub parameter_summary: String,
    pub source: SqlEvidenceSource,
    pub sample_count: u64,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
    pub average_rows: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SqlEvidenceSource {
    PrismaQueryEvent,
    Axiom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DataAccessKind {
    Read,
    Write,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContractNodeKind {
    Endpoint,
    Middleware,
    Service,
    Database,
    Schema,
    Helper,
    External,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub kind: ContractEdgeKind,
    pub label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContractEdgeKind {
    Guards,
    Invokes,
    Reads,
    Writes,
    UsesSchema,
    Returns,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpan {
    pub start: u32,
    pub end: u32,
    pub start_line: Option<u32>,
    pub end_line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserDiagnostic {
    pub message: String,
    pub severity: DiagnosticSeverity,
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub models: Vec<OllamaModel>,
    pub selected_model: Option<String>,
    pub annotation_ready: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModel {
    pub name: String,
    pub embedding_only: bool,
}
