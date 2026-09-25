mod analyzer;
mod error;
mod model;
mod oxc_facts;
mod prisma;
mod relations;
mod sql_interpreter;

pub use analyzer::{AnalysisLimits, analyze_project, analyze_project_with_limits};
pub use error::AnalysisError;
pub use model::{
    AnalysisReport, AnalysisSummary, ApiContract, CallFact, ContractEdge, ContractEdgeKind,
    ContractNode, ContractNodeKind, DataAccessFact, DataAccessKind, DiagnosticSeverity,
    FileAnalysis, FileMetrics, InterpretedSql, ObservedSqlEvidence, OllamaModel, OllamaStatus,
    ParserDiagnostic, RouteFact, SourceSpan, SqlEvidenceSource, SymbolFact, SymbolKind,
};
