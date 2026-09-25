import {
  ArrowSquareOut,
  BracketsCurly,
  Check,
  Code,
  Copy,
  Database,
  FileText,
  Gear,
  Pulse,
  ShareNetwork,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { useState } from "react";

import {
  friendlyContractTitle,
  sourceLabel,
  stepCategory,
  stepDescription,
  stepTitle,
  type ViewMode,
} from "../presentation";
import type { ApiContract, ContractEdge, ContractNode } from "../types";

type InspectorPanelProps = {
  node: ContractNode | null;
  contract: ApiContract;
  mode: ViewMode;
  relations: ContractEdge[];
  onClose: () => void;
};

export function InspectorPanel({ node, contract, mode, relations, onClose }: InspectorPanelProps) {
  const [copied, setCopied] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  if (!node) {
    return (
      <aside className="details-panel details-empty">
        <ShareNetwork />
        <h2>Select something to inspect</h2>
        <p>Choose a step or dependency to see the compiler evidence behind it.</p>
      </aside>
    );
  }

  const title = node.kind === "endpoint" ? friendlyContractTitle(contract) : stepTitle(node);
  const description = node.kind === "endpoint" ? contract.summary ?? node.detail : stepDescription(node);
  const selectedSource = sourceLabel(node, contract);

  async function copySource() {
    await navigator.clipboard.writeText(selectedSource);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function copyObservedSql() {
    const statement = node?.dataAccess?.sqlEvidence?.statement;
    if (!statement) return;
    await navigator.clipboard.writeText(statement);
    setCopiedSql(true);
    window.setTimeout(() => setCopiedSql(false), 1800);
  }

  return (
    <aside className="details-panel" aria-label="Selected item details">
      <div className="inspector-heading">
        <span className={`inspector-icon icon-${node.kind}`}>{nodeIcon(node)}</span>
        <div>
          <small>{mode === "workflow" ? node.kind === "endpoint" ? "Trigger" : `Step ${node.order}` : stepCategory(node)}</small>
          <h2>{title}</h2>
        </div>
        <button type="button" aria-label="Close details" onClick={onClose}><X /></button>
      </div>
      <p className="node-description">{description}</p>

      <section className="inspector-section why-section">
        <h3>{mode === "relations" ? "Why connected" : mode === "data" ? "Data access impact" : "Why this matters"}</h3>
        <p>{whyItMatters(node, mode)}</p>
      </section>

      <section className="inspector-section evidence-section">
        <h3><Code /> Compiler evidence</h3>
        <p>This behavior was found through static analysis, not generated as a guess.</p>
        <dl>
          <div><dt>File</dt><dd>{node.filePath ?? contract.filePath}</dd></div>
          <div><dt>Lines</dt><dd>{lineLabel(node)}</dd></div>
          <div><dt>Kind</dt><dd>{node.kind}</dd></div>
          {node.dataAccess ? <div><dt>Effect</dt><dd>{node.dataAccess.access}</dd></div> : null}
          {node.dataAccess ? <div><dt>Query</dt><dd title={node.dataAccess.expression}>{node.dataAccess.expression}</dd></div> : null}
        </dl>
        <button type="button" className="button button-secondary source-button" onClick={copySource}>
          {copied ? <Check weight="bold" /> : <ArrowSquareOut />}
          {copied ? "Source location copied" : "View source"}
        </button>
      </section>

      {node.dataAccess ? (
        <section className="inspector-section sql-evidence-section">
          <h3><Database /> SQL view</h3>
          {node.dataAccess.interpretedSql ? (
            <div className="sql-layer">
              <div className="sql-evidence-heading is-static">
                <span><Code /> Compiler interpretation</span>
                <small>Approximate SQL shape</small>
              </div>
              <pre><code>{node.dataAccess.interpretedSql.statement}</code></pre>
              {node.dataAccess.interpretedSql.limitations.length > 0 ? (
                <ul className="sql-limitations">
                  {node.dataAccess.interpretedSql.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="sql-unavailable">This Prisma operation cannot be interpreted as SQL yet.</p>
          )}
          <div className="sql-runtime-layer">
          {node.dataAccess.sqlEvidence ? (
            <>
              <div className="sql-evidence-heading">
                <span><Pulse weight="fill" /> Runtime observed</span>
                <small>{sqlSourceLabel(node.dataAccess.sqlEvidence.source)}</small>
              </div>
              <pre><code>{node.dataAccess.sqlEvidence.statement}</code></pre>
              <p className="sql-parameters"><strong>Sanitized parameters</strong>{node.dataAccess.sqlEvidence.parameterSummary}</p>
              <div className="sql-metrics">
                <Metric label="Samples" value={node.dataAccess.sqlEvidence.sampleCount.toLocaleString()} />
                <Metric label="p50" value={`${node.dataAccess.sqlEvidence.p50Ms} ms`} />
                <Metric label="p95" value={`${node.dataAccess.sqlEvidence.p95Ms} ms`} />
                <Metric label="p99" value={`${node.dataAccess.sqlEvidence.p99Ms} ms`} />
              </div>
              <button type="button" className="button button-secondary sql-copy-button" onClick={copyObservedSql}>
                {copiedSql ? <Check weight="bold" /> : <Copy />}
                {copiedSql ? "SQL copied" : "Copy observed SQL"}
              </button>
            </>
          ) : (
            <div className="sql-empty-state">
              <Database />
              <div>
                <strong>SQL not observed yet</strong>
                <p>Connect a sanitized Prisma query event or Axiom span to show the real statement and latency here.</p>
              </div>
            </div>
          )}
          </div>
        </section>
      ) : null}

      <section className="inspector-section related-section">
        <h3><ShareNetwork /> Related parts</h3>
        <p>This item directly interacts with:</p>
        <div className="related-list">
          {relations.slice(0, 4).map((edge) => {
            const related = relatedNode(edge, node, contract);
            return (
              <div key={edge.id}>
                <span className={`related-icon icon-${related?.kind ?? "helper"}`}>{related ? nodeIcon(related) : <BracketsCurly />}</span>
                <span><strong>{related?.label ?? "Unknown"}</strong><small>{edge.label}</small></span>
              </div>
            );
          })}
          {relations.length === 0 ? <small>No direct relation was resolved.</small> : null}
        </div>
      </section>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function sqlSourceLabel(source: "prismaQueryEvent" | "axiom"): string {
  return source === "axiom" ? "Axiom runtime traces" : "Prisma query event";
}

function nodeIcon(node: ContractNode) {
  if (node.kind === "middleware") return <ShieldCheck />;
  if (node.kind === "database") return <Database />;
  if (node.kind === "schema") return <FileText />;
  if (node.kind === "endpoint") return <BracketsCurly />;
  return <Gear />;
}

function whyItMatters(node: ContractNode, mode: ViewMode): string {
  if (mode === "data" && node.dataAccess) {
    return node.dataAccess.access === "write"
      ? "This call changes persisted data and contributes one resolved database round trip to the API."
      : "This read contributes one resolved database round trip. Its normalized query fingerprint is used to find safe reuse candidates.";
  }
  if (mode === "relations") {
    return `This ${node.kind} is part of the selected API's dependency chain. Changing it may affect the route or another connected backend action.`;
  }
  if (node.kind === "middleware") {
    return "This check prevents the backend from doing work for a request that is not allowed to continue.";
  }
  if (node.kind === "endpoint") {
    return "This is the public promise of the API: what starts it, what it can touch, and what the caller receives.";
  }
  if (node.kind === "database") {
    return "This is where the workflow touches persisted application data.";
  }
  if (node.kind === "schema") {
    return "This contract keeps information entering or leaving the API in a predictable shape.";
  }
  return "This step contributes business logic needed to complete the API action.";
}

function lineLabel(node: ContractNode): string {
  if (!node.span?.startLine) return "Not available";
  const end = node.span.endLine ?? node.span.startLine;
  return end === node.span.startLine ? `${end}` : `${node.span.startLine}–${end}`;
}

function relatedNode(edge: ContractEdge, node: ContractNode, contract: ApiContract) {
  const id = edge.source === node.id ? edge.target : edge.source;
  return contract.nodes.find((candidate) => candidate.id === id) ?? null;
}
