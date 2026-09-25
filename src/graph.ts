import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { ApiContract, ContractNode, ContractNodeKind } from "./types";

export type CanvasMode = "relations" | "workflow";

export type CanvasNodeData = {
  label: string;
  detail: string;
  kind: ContractNodeKind;
  contractNode: ContractNode;
};

export type CanvasGraph = {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
};

export function contractToCanvas(
  contract: ApiContract,
  mode: CanvasMode,
  selectedNodeId: string | null,
): CanvasGraph {
  const visibleNodes =
    mode === "workflow"
      ? contract.nodes.filter((node) => node.kind !== "schema")
      : contract.nodes;
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = contract.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  const positions =
    mode === "workflow"
      ? workflowPositions(visibleNodes, visibleEdges)
      : relationPositions(visibleNodes, contract);

  const nodes: Node<CanvasNodeData>[] = visibleNodes.map((node) => ({
    id: node.id,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      label: `${node.label}\n${node.detail}`,
      detail: node.detail,
      kind: node.kind,
      contractNode: node,
    },
    className: `contract-node contract-node-${node.kind}`,
    selected: node.id === selectedNodeId,
  }));

  const edges: Edge[] = visibleEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    label: mode === "relations" ? edge.label : undefined,
    className: `contract-edge contract-edge-${edge.kind}`,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
  }));

  return { nodes, edges };
}

function relationPositions(
  nodes: ContractNode[],
  contract: ApiContract,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const responseSchemaIds = new Set(
    contract.edges
      .filter((edge) => edge.kind === "returns")
      .map((edge) => edge.target),
  );
  const endpointId = nodes.find((node) => node.kind === "endpoint")?.id;
  const contractSchemaIds = new Set(
    contract.edges
      .filter(
        (edge) =>
          (edge.kind === "usesSchema" && edge.target === endpointId) ||
          (edge.kind === "returns" && edge.source === endpointId),
      )
      .map((edge) => (edge.source === endpointId ? edge.target : edge.source)),
  );
  const columns = new Map<number, ContractNode[]>();

  for (const node of nodes) {
    let column = 1;
    if (node.kind === "schema") column = contractSchemaIds.has(node.id) ? 0 : 2;
    if (node.kind === "endpoint") column = 0;
    if (node.kind === "middleware") column = 1;
    if (node.kind === "database" || node.kind === "external") column = 2;
    const columnNodes = columns.get(column) ?? [];
    columnNodes.push(node);
    columns.set(column, columnNodes);
  }

  for (const [column, columnNodes] of columns) {
    columnNodes.sort((left, right) => left.order - right.order);
    if (column === 0) {
      columnNodes.sort((left, right) => {
        const rank = (node: ContractNode) => {
          if (node.kind === "endpoint") return 1;
          return responseSchemaIds.has(node.id) ? 2 : 0;
        };
        return rank(left) - rank(right) || left.order - right.order;
      });
    }
    const totalHeight = (columnNodes.length - 1) * 116;
    columnNodes.forEach((node, index) => {
      positions.set(node.id, {
        x: 48 + column * 258,
        y: 300 - totalHeight / 2 + index * 116,
      });
    });
  }
  return positions;
}

function workflowPositions(
  nodes: ContractNode[],
  edges: ApiContract["edges"],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const levels = new Map<string, number>();
  const endpoint = nodes.find((node) => node.kind === "endpoint");
  if (endpoint) levels.set(endpoint.id, 0);

  for (let iteration = 0; iteration < nodes.length; iteration += 1) {
    for (const edge of edges) {
      const sourceLevel = levels.get(edge.source);
      if (sourceLevel === undefined) continue;
      levels.set(edge.target, Math.max(levels.get(edge.target) ?? 0, sourceLevel + 1));
    }
  }

  const lanes = new Map<number, ContractNode[]>();
  for (const node of nodes) {
    const fallback = node.kind === "endpoint" ? 0 : node.order;
    const level = Math.min(levels.get(node.id) ?? fallback, 7);
    const lane = lanes.get(level) ?? [];
    lane.push(node);
    lanes.set(level, lane);
  }

  for (const [level, lane] of lanes) {
    lane.sort((left, right) => left.order - right.order);
    const totalHeight = (lane.length - 1) * 124;
    lane.forEach((node, index) => {
      positions.set(node.id, {
        x: 48 + level * 242,
        y: 300 - totalHeight / 2 + index * 124,
      });
    });
  }
  return positions;
}
