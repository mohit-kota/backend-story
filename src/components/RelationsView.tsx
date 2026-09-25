import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import { Database, LockKey, ShareNetwork, ShieldCheck } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import "@xyflow/react/dist/style.css";

import { contractToCanvas } from "../graph";
import { contractFacts } from "../presentation";
import type { ApiContract } from "../types";

type RelationsViewProps = {
  contract: ApiContract;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onClearSelection: () => void;
};

export function RelationsView({
  contract,
  selectedNodeId,
  onSelectNode,
  onClearSelection,
}: RelationsViewProps) {
  const [includeNested, setIncludeNested] = useState(true);
  const facts = contractFacts(contract);
  const graph = useMemo(
    () => contractToCanvas(contract, "relations", selectedNodeId),
    [contract, selectedNodeId],
  );

  return (
    <div className="relations-surface">
      <div className="relations-summary">
        <span>{facts.protected ? <LockKey /> : <ShieldCheck />}<strong>{facts.protected ? "Protected" : "Public"}</strong></span>
        <span><ShareNetwork /><strong>{contract.nodes.length - 1} dependencies</strong></span>
        <span><Database /><strong>{facts.writesData ? "Changes data" : facts.readsData ? "Read-only" : "No database effect"}</strong></span>
        <div className="depth-switch" aria-label="Relation depth">
          <button type="button" className={!includeNested ? "is-active" : ""} onClick={() => setIncludeNested(false)}>Direct only</button>
          <button type="button" className={includeNested ? "is-active" : ""} onClick={() => setIncludeNested(true)}>Include nested</button>
        </div>
      </div>
      <div className="relations-canvas">
        <div className="canvas-caption">
          <strong>Dependency map</strong>
          <span>See what this action depends on and what it touches.</span>
        </div>
        <ReactFlow
          key={`${contract.id}:relations:${includeNested ? "nested" : "direct"}`}
          nodes={includeNested ? graph.nodes : graph.nodes.filter((node) => node.data.kind === "endpoint" || node.data.contractNode.order <= 2)}
          edges={includeNested ? graph.edges : graph.edges.filter((edge) => {
            const visible = new Set(graph.nodes.filter((node) => node.data.kind === "endpoint" || node.data.contractNode.order <= 2).map((node) => node.id));
            return visible.has(edge.source) && visible.has(edge.target);
          })}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1.05 }}
          minZoom={0.08}
          maxZoom={1.6}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => onSelectNode(node.id)}
          onPaneClick={onClearSelection}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
