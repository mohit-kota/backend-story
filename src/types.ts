export type AnalysisReport = {
  root: string;
  analyzedAtUnixMs: number;
  summary: AnalysisSummary;
  files: FileAnalysis[];
  contracts: ApiContract[];
};

export type AnalysisSummary = {
  totalFiles: number;
  parsedFiles: number;
  failedFiles: number;
  totalBytes: number;
  imports: number;
  functions: number;
  classes: number;
  calls: number;
  routes: number;
  prismaModels: number;
  prismaEnums: number;
  diagnostics: number;
};

export type FileAnalysis = {
  id: string;
  path: string;
  language: string;
  contentHash: string;
  byteLength: number;
  imports: string[];
  symbols: SymbolFact[];
  calls: CallFact[];
  routes: RouteFact[];
  diagnostics: ParserDiagnostic[];
  metrics: FileMetrics;
};

export type FileMetrics = {
  imports: number;
  functions: number;
  classes: number;
  calls: number;
  routes: number;
  prismaModels: number;
  prismaEnums: number;
};

export type SymbolFact = {
  id: string;
  name: string;
  kind: "function" | "class" | "method" | "schema" | "prismaModel" | "prismaEnum";
  span: SourceSpan;
};

export type CallFact = {
  id: string;
  callee: string;
  expression: string;
  owner: string | null;
  span: SourceSpan;
};

export type RouteFact = {
  id: string;
  method: string;
  path: string;
  summary: string | null;
  span: SourceSpan;
  handlerSpan: SourceSpan | null;
  middleware: string[];
  schemaRefs: string[];
  calls: CallFact[];
};

export type ApiContract = {
  id: string;
  method: string;
  path: string;
  summary: string | null;
  filePath: string;
  span: SourceSpan;
  nodes: ContractNode[];
  edges: ContractEdge[];
};

export type ContractNodeKind =
  | "endpoint"
  | "middleware"
  | "service"
  | "database"
  | "schema"
  | "helper"
  | "external";

export type ContractNode = {
  id: string;
  label: string;
  detail: string;
  kind: ContractNodeKind;
  filePath: string | null;
  span: SourceSpan | null;
  order: number;
  dataAccess?: DataAccessFact;
};

export type DataAccessFact = {
  model: string;
  operation: string;
  access: "read" | "write";
  fingerprint: string;
  shapeFingerprint: string;
  expression: string;
  interpretedSql?: InterpretedSql;
  sqlEvidence?: ObservedSqlEvidence;
};

export type InterpretedSql = {
  statement: string;
  limitations: string[];
};

export type ObservedSqlEvidence = {
  statement: string;
  normalizedStatement: string;
  fingerprint: string;
  parameterSummary: string;
  source: "prismaQueryEvent" | "axiom";
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  averageRows: number | null;
};

export type ContractEdgeKind =
  | "guards"
  | "invokes"
  | "reads"
  | "writes"
  | "usesSchema"
  | "returns";

export type ContractEdge = {
  id: string;
  source: string;
  target: string;
  kind: ContractEdgeKind;
  label: string;
};

export type SourceSpan = {
  start: number;
  end: number;
  startLine: number | null;
  endLine: number | null;
};

export type ParserDiagnostic = {
  message: string;
  severity: "error" | "warning";
  span: SourceSpan | null;
};

export type OllamaStatus = {
  installed: boolean;
  running: boolean;
  models: OllamaModel[];
  selectedModel: string | null;
  annotationReady: boolean;
  message: string;
};

export type OllamaModel = {
  name: string;
  embeddingOnly: boolean;
};

export type AiSqlInterpretation = {
  statement: string;
  explanation: string;
  assumptions: string[];
  model: string;
};

export type AiSqlInterpretationInput = {
  model: string;
  prismaModel: string;
  operation: string;
  prismaExpression: string;
  deterministicSql: string | null;
};
