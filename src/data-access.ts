import { sourceLabel } from "./presentation";
import type { ApiContract, ContractNode, InterpretedSql, ObservedSqlEvidence } from "./types";

export type DataAccessOperation = {
  id: string;
  node: ContractNode;
  model: string;
  operation: string;
  access: "read" | "write";
  fingerprint: string;
  shapeFingerprint: string;
  expression: string;
  interpretedSql: InterpretedSql | null;
  sqlEvidence: ObservedSqlEvidence | null;
  origin: ContractNode | null;
  source: string;
  duplicate: "exact" | "similar" | null;
};

export type DuplicateReadGroup = {
  id: string;
  confidence: "exact" | "similar";
  model: string;
  operation: string;
  operations: DataAccessOperation[];
};

export type DataAccessAnalysis = {
  operations: DataAccessOperation[];
  exactDuplicateGroups: DuplicateReadGroup[];
  similarReadGroups: DuplicateReadGroup[];
  reads: number;
  writes: number;
  interpretedSql: number;
  observedSql: number;
  resolvedRoundTrips: number;
  reusableRoundTrips: number;
  projectedRoundTrips: number;
};

export function analyzeDataAccess(contract: ApiContract): DataAccessAnalysis {
  const nodesById = new Map(contract.nodes.map((node) => [node.id, node]));
  const operations = contract.nodes
    .filter((node) => node.kind === "database")
    .map((node): DataAccessOperation => {
      const relation = contract.edges.find(
        (edge) => edge.target === node.id && (edge.kind === "reads" || edge.kind === "writes"),
      );
      const [fallbackModel = "unknown", fallbackOperation = "query"] = node.label.split(".");
      const access = node.dataAccess?.access ?? (relation?.kind === "writes" ? "write" : "read");
      return {
        id: node.id,
        node,
        model: node.dataAccess?.model ?? fallbackModel,
        operation: node.dataAccess?.operation ?? fallbackOperation,
        access,
        fingerprint:
          node.dataAccess?.sqlEvidence?.fingerprint ??
          node.dataAccess?.fingerprint ??
          `unresolved:${node.id}`,
        shapeFingerprint:
          node.dataAccess?.shapeFingerprint ??
          `${fallbackModel.toLocaleLowerCase()}:${fallbackOperation.toLocaleLowerCase()}`,
        expression: node.dataAccess?.expression ?? node.label,
        interpretedSql: node.dataAccess?.interpretedSql ?? null,
        sqlEvidence: node.dataAccess?.sqlEvidence ?? null,
        origin: relation ? nodesById.get(relation.source) ?? null : null,
        source: sourceLabel(node, contract),
        duplicate: null,
      };
    })
    .sort((left, right) => left.node.order - right.node.order);

  const readOperations = operations.filter((operation) => operation.access === "read");
  const exactDuplicateGroups = groupedReads(readOperations, "fingerprint", "exact");
  const exactFingerprints = new Set(exactDuplicateGroups.map((group) => group.id));
  const similarReadGroups = groupedReads(readOperations, "shapeFingerprint", "similar").filter(
    (group) => new Set(group.operations.map((operation) => operation.fingerprint)).size > 1,
  );
  const similarShapes = new Set(similarReadGroups.map((group) => group.id));

  for (const operation of operations) {
    if (exactFingerprints.has(operation.fingerprint)) operation.duplicate = "exact";
    else if (similarShapes.has(operation.shapeFingerprint)) operation.duplicate = "similar";
  }

  const reusableRoundTrips = exactDuplicateGroups.reduce(
    (total, group) => total + group.operations.length - 1,
    0,
  );

  return {
    operations,
    exactDuplicateGroups,
    similarReadGroups,
    reads: readOperations.length,
    writes: operations.length - readOperations.length,
    interpretedSql: operations.filter((operation) => operation.interpretedSql).length,
    observedSql: operations.filter((operation) => operation.sqlEvidence).length,
    resolvedRoundTrips: operations.length,
    reusableRoundTrips,
    projectedRoundTrips: operations.length - reusableRoundTrips,
  };
}

function groupedReads(
  operations: DataAccessOperation[],
  key: "fingerprint" | "shapeFingerprint",
  confidence: "exact" | "similar",
): DuplicateReadGroup[] {
  const groups = new Map<string, DataAccessOperation[]>();
  for (const operation of operations) {
    const items = groups.get(operation[key]) ?? [];
    items.push(operation);
    groups.set(operation[key], items);
  }

  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([id, items]) => ({
      id,
      confidence,
      model: items[0]?.model ?? "unknown",
      operation: items[0]?.operation ?? "query",
      operations: items,
    }));
}
