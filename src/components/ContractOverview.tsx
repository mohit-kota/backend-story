import {
  ArrowRight,
  CheckCircle,
  Database,
  FileArrowDown,
  FileArrowUp,
  LockKey,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";

import { clientAction, contractDescription, contractFacts, stepTitle } from "../presentation";
import type { ApiContract } from "../types";

type ContractOverviewProps = {
  contract: ApiContract;
  onOpenWorkflow: () => void;
};

export function ContractOverview({ contract, onOpenWorkflow }: ContractOverviewProps) {
  const facts = contractFacts(contract);
  const narrative = facts.workflowNodes.filter((node) => node.kind !== "schema").slice(0, 4);

  return (
    <div className="contract-overview">
      <section className="contract-signal-row" aria-label="Contract characteristics">
        <Signal icon={facts.protected ? LockKey : ShieldCheck} title={facts.protected ? "Protected" : "Public"} detail={facts.protected ? "Requires authentication" : "No authentication guard found"} tone="green" />
        <Signal icon={Database} title={facts.writesData ? "Changes data" : facts.readsData ? "Reads data" : "No database call"} detail={facts.writesData ? "Contains a database write" : facts.readsData ? "Reads through Prisma" : "No Prisma effect resolved"} tone="blue" />
        <Signal icon={CheckCircle} title="Compiler verified" detail="Backed by source evidence" tone="violet" />
      </section>

      <div className="contract-overview-grid">
        <div className="contract-overview-column">
          <OverviewSection icon={FileArrowDown} title="What starts it">
            <h3>A client {clientAction(contract)}</h3>
            <p>{contractDescription(contract)}</p>
          </OverviewSection>

          <OverviewSection icon={FileArrowUp} title="What it needs">
            {facts.requestSchemas.length > 0 ? (
              <div className="schema-list">
                {facts.requestSchemas.map((schema) => (
                  <div key={schema.id}>
                    <strong>{schema.label}</strong>
                    <span>Validated request information</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>No named input schema was resolved for this route.</p>
            )}
          </OverviewSection>
        </div>

        <div className="contract-overview-column">
          <OverviewSection icon={FileArrowUp} title="What it returns">
            {facts.responseSchemas.length > 0 ? (
              <div className="schema-list">
                {facts.responseSchemas.map((schema) => (
                  <div key={schema.id}>
                    <strong>{schema.label}</strong>
                    <span>Structured API response</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>The response shape was not resolved statically.</p>
            )}
          </OverviewSection>

          <OverviewSection icon={WarningCircle} title="When it can stop">
            <div className="failure-list">
              {facts.protected ? <span><i>Access</i> The request is not authorized</span> : null}
              <span><i>Validation</i> Required information is missing or invalid</span>
              <small>Only compiler-supported failure paths are shown.</small>
            </div>
          </OverviewSection>
        </div>
      </div>

      <section className="contract-narrative">
        <div>
          <p className="section-kicker">What this action does</p>
          <h2>In plain English, here is what happens</h2>
        </div>
        <ol>
          {narrative.map((node) => (
            <li key={node.id}>
              <strong>{stepTitle(node)}</strong>
              <span>{node.detail}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="button button-primary" onClick={onOpenWorkflow}>
          Open workflow <ArrowRight weight="bold" />
        </button>
      </section>
    </div>
  );
}

function Signal({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: typeof LockKey;
  title: string;
  detail: string;
  tone: "green" | "blue" | "violet";
}) {
  return (
    <div className={`contract-signal signal-${tone}`}>
      <Icon aria-hidden="true" />
      <span><strong>{title}</strong><small>{detail}</small></span>
    </div>
  );
}

function OverviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileArrowDown;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overview-section">
      <div className="overview-section-title"><Icon /><h2>{title}</h2></div>
      {children}
    </section>
  );
}
