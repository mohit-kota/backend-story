import {
  ArrowRight,
  CheckCircle,
  Database,
  Files,
  GitMerge,
  Lightning,
  MapPin,
  Sparkle,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { analyzeDataAccess, type DataAccessOperation } from "../data-access";
import { interpretPrismaWithOllama } from "../api";
import { humanize } from "../presentation";
import type { AiSqlInterpretation, ApiContract } from "../types";

type DataAccessViewProps = {
  contract: ApiContract;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  aiModel: string | null;
};

export function DataAccessView({ contract, selectedNodeId, onSelectNode, aiModel }: DataAccessViewProps) {
  const analysis = useMemo(() => analyzeDataAccess(contract), [contract]);
  const [aiResults, setAiResults] = useState<Record<string, AiSqlInterpretation>>({});
  const [aiPendingId, setAiPendingId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const focusedOperation =
    analysis.operations.find((operation) => operation.id === selectedNodeId) ??
    analysis.operations[0] ??
    null;
  const focusedAiResult = focusedOperation ? aiResults[focusedOperation.id] ?? null : null;

  async function interpretWithAi(operation: DataAccessOperation) {
    if (!aiModel) return;
    setAiPendingId(operation.id);
    setAiError(null);
    try {
      const result = await interpretPrismaWithOllama({
        model: aiModel,
        prismaModel: operation.model,
        operation: operation.operation,
        prismaExpression: operation.expression,
        deterministicSql: operation.interpretedSql?.statement ?? null,
      });
      setAiResults((current) => ({ ...current, [operation.id]: result }));
    } catch (error) {
      setAiError(String(error));
    } finally {
      setAiPendingId(null);
    }
  }

  if (analysis.operations.length === 0) {
    return (
      <section className="data-access-empty">
        <Database />
        <h2>No database operations resolved</h2>
        <p>The compiler did not find a Prisma call in this API's resolved dependency chain.</p>
      </section>
    );
  }

  return (
    <section className="data-access-view">
      <header className="data-access-summary">
        <SummaryCard
          icon={<Database />}
          label="Resolved calls"
          value={analysis.operations.length}
          detail={`${analysis.interpretedSql} interpreted · ${analysis.observedSql} observed`}
        />
        <SummaryCard icon={<Files />} label="Reads / writes" value={`${analysis.reads} / ${analysis.writes}`} detail="Data effects" />
        <SummaryCard
          icon={<GitMerge />}
          label="Reusable reads"
          value={analysis.reusableRoundTrips}
          detail="Exact duplicate calls"
          tone={analysis.reusableRoundTrips > 0 ? "warning" : "good"}
        />
        <SummaryCard
          icon={<Lightning />}
          label="Round trips"
          value={`${analysis.resolvedRoundTrips} → ${analysis.projectedRoundTrips}`}
          detail="Current → reuse estimate"
          tone={analysis.reusableRoundTrips > 0 ? "warning" : "good"}
        />
      </header>

      <div className={`data-access-finding ${analysis.reusableRoundTrips > 0 ? "has-opportunity" : "is-clean"}`}>
        {analysis.reusableRoundTrips > 0 ? <WarningCircle weight="fill" /> : <CheckCircle weight="fill" />}
        <div>
          <strong>
            {analysis.reusableRoundTrips > 0
              ? `${analysis.reusableRoundTrips} database round trip${analysis.reusableRoundTrips === 1 ? "" : "s"} may be reusable`
              : "No exact duplicate reads detected"}
          </strong>
          <p>
            {analysis.reusableRoundTrips > 0
              ? "These calls have the same normalized Prisma expression. Fetch once and pass the result only when execution order and authorization scope are equivalent."
              : "The resolved reads use distinct query fingerprints. Branch and loop multiplicity are not estimated yet."}
          </p>
        </div>
      </div>

      {focusedOperation ? (
        <section className="query-translation">
          <div className="data-section-title">
            <div><p>Query translation</p><h2>Prisma call → SQL interpretation</h2></div>
            <span>{focusedOperation.source}</span>
          </div>
          <div className="query-translation-grid">
            <article>
              <header><span>Prisma ORM</span><i>Compiler source</i></header>
              <pre><code>{focusedOperation.expression}</code></pre>
            </article>
            <span className="translation-arrow"><ArrowRight /></span>
            <article className="sql-preview-card">
              <header>
                <span>Readable SQL</span>
                <i>{focusedOperation.sqlEvidence ? "Observed counterpart available" : "Compiler approximation"}</i>
              </header>
              {focusedOperation.interpretedSql ? (
                <pre><code>{focusedOperation.interpretedSql.statement}</code></pre>
              ) : (
                <p>This Prisma operation cannot be translated yet.</p>
              )}
              {focusedOperation.interpretedSql?.limitations.map((limitation) => (
                <small key={limitation}><WarningCircle />{limitation}</small>
              ))}
            </article>
          </div>
          {aiModel ? (
            <div className="ai-sql-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={aiPendingId === focusedOperation.id}
                onClick={() => interpretWithAi(focusedOperation)}
              >
                {aiPendingId === focusedOperation.id ? <SpinnerGap className="spin" /> : <Sparkle weight="fill" />}
                {aiPendingId === focusedOperation.id
                  ? `Asking ${aiModel}…`
                  : focusedOperation.interpretedSql?.limitations.length
                    ? `Interpret missing parts with ${aiModel}`
                    : `Validate with ${aiModel}`}
              </button>
              <span>Runs locally through Ollama. AI output is a suggestion, not runtime evidence.</span>
            </div>
          ) : null}
          {aiError ? <p className="ai-sql-error">{aiError}</p> : null}
          {focusedAiResult ? (
            <article className="ai-sql-result">
              <header><span><Sparkle weight="fill" /> AI interpretation</span><i>{focusedAiResult.model} · local</i></header>
              <pre><code>{focusedAiResult.statement}</code></pre>
              <p>{focusedAiResult.explanation}</p>
              {focusedAiResult.assumptions.length > 0 ? (
                <ul>{focusedAiResult.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
              ) : null}
            </article>
          ) : null}
        </section>
      ) : null}

      {analysis.exactDuplicateGroups.length > 0 ? (
        <section className="duplicate-section">
          <div className="data-section-title">
            <div><p>Optimization candidates</p><h2>Duplicate read groups</h2></div>
            <span>Exact call fingerprint · verify runtime scope</span>
          </div>
          <div className="duplicate-grid">
            {analysis.exactDuplicateGroups.map((group) => (
              <article key={group.id} className="duplicate-card">
                <header>
                  <span className="database-chip"><Database /></span>
                  <div><strong>{humanize(group.model)}</strong><code>.{group.operation}()</code></div>
                  <i>{group.operations.length} calls</i>
                </header>
                <div className="duplicate-paths">
                  {group.operations.map((operation) => (
                    <OperationOrigin key={operation.id} operation={operation} onSelect={onSelectNode} />
                  ))}
                </div>
                <footer><GitMerge /> Reuse one result to avoid up to {group.operations.length - 1} round trip{group.operations.length === 2 ? "" : "s"}</footer>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="operation-section">
        <div className="data-section-title">
          <div><p>Compiler inventory</p><h2>All database operations</h2></div>
          <span>{analysis.operations.length} resolved from this API</span>
        </div>
        <div className="operation-table" role="table" aria-label="Database operations">
          <div className="operation-table-head" role="row">
            <span>Operation</span><span>Called from</span><span>Source evidence</span><span>Evidence</span>
          </div>
          {analysis.operations.map((operation) => (
            <button
              type="button"
              role="row"
              key={operation.id}
              className={selectedNodeId === operation.id ? "is-selected" : ""}
              onClick={() => onSelectNode(operation.id)}
            >
              <span className="operation-name"><Database /><span><strong>{operation.model}.{operation.operation}</strong><code>{operation.expression}</code></span></span>
              <span className="operation-origin">{operation.origin?.label ?? "API handler"}</span>
              <span className="operation-source"><MapPin />{operation.source}</span>
              <span className="operation-signals">
                <span className={`effect-pill effect-${operation.access}`}>{operation.access}</span>
                <span className={`sql-status ${operation.sqlEvidence ? "is-observed" : operation.interpretedSql ? "is-interpreted" : ""}`}>
                  {operation.sqlEvidence ? "SQL observed" : operation.interpretedSql ? "SQL interpreted" : "Prisma only"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {analysis.similarReadGroups.length > 0 ? (
        <p className="similar-note">
          <WarningCircle /> {analysis.similarReadGroups.length} additional read group{analysis.similarReadGroups.length === 1 ? "" : "s"} use the same model and operation but different expressions. Review manually; they are not counted as reusable.
        </p>
      ) : null}

      <p className="estimate-note">Round trips are a static estimate of resolved Prisma calls. Runtime branches, loops, batching, transactions, and cache hits are not modeled yet.</p>
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "good" | "warning";
}) {
  return <article className={`data-summary-card tone-${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function OperationOrigin({ operation, onSelect }: { operation: DataAccessOperation; onSelect: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onSelect(operation.id)}>
      <span><strong>{operation.origin?.label ?? "API handler"}</strong><small>{operation.source}</small></span>
      <ArrowRight />
    </button>
  );
}
