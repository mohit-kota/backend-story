import {
  ArrowDown,
  Check,
  CheckCircle,
  Database,
  Eye,
  EyeSlash,
  FileText,
  Gear,
  Lightning,
  ShieldCheck,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";

import {
  clientAction,
  contractDescription,
  contractFacts,
  friendlyContractTitle,
  stepCategory,
  stepDescription,
  stepTitle,
} from "../presentation";
import type { ApiContract, ContractNode } from "../types";

type WorkflowViewProps = {
  contract: ApiContract;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

export function WorkflowView({ contract, selectedNodeId, onSelectNode }: WorkflowViewProps) {
  const [showErrorPaths, setShowErrorPaths] = useState(true);
  const facts = contractFacts(contract);
  const endpoint = contract.nodes.find((node) => node.kind === "endpoint");
  const steps = facts.workflowNodes.filter((node) => !facts.responseSchemas.some((schema) => schema.id === node.id));
  const firstGuardIndex = steps.findIndex((node) => node.kind === "middleware");

  return (
    <div className="workflow-surface">
      <div className="workflow-story">
        {endpoint ? (
          <button
            type="button"
            className={`trigger-card ${selectedNodeId === endpoint.id ? "is-selected" : ""}`}
            onClick={() => onSelectNode(endpoint.id)}
          >
            <span className="workflow-icon icon-trigger"><Lightning weight="fill" /></span>
            <span>
              <small>Trigger</small>
              <strong>When a client {clientAction(contract)}</strong>
              <p>{contractDescription(contract)}</p>
            </span>
          </button>
        ) : null}

        {steps.map((node, index) => (
          <div className="workflow-step-group" key={node.id}>
            <div className="workflow-connector"><ArrowDown weight="bold" /></div>
            <div className={`workflow-row ${showErrorPaths && index === firstGuardIndex ? "has-branch" : ""}`}>
              <button
                type="button"
                className={`workflow-card ${selectedNodeId === node.id ? "is-selected" : ""}`}
                onClick={() => onSelectNode(node.id)}
              >
                <span className={`workflow-icon icon-${node.kind}`}>{nodeIcon(node)}</span>
                <span className="workflow-card-copy">
                  <span className="workflow-step-meta">
                    <small>Step {index + 1}</small>
                    <i>{stepCategory(node)}</i>
                  </span>
                  <strong>{stepTitle(node)}</strong>
                  <p>{stepDescription(node)}</p>
                </span>
                <span className="workflow-more" aria-hidden="true">•••</span>
              </button>

              {showErrorPaths && index === firstGuardIndex ? (
                <>
                  <span className="branch-yes">Yes</span>
                  <div className="guard-branch" aria-label="Authorization failure path">
                    <span className="branch-no">No</span>
                    <div className="error-terminal">
                      <Warning weight="fill" />
                      <span><strong>Access denied</strong><small>The guard stops this request.</small></span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ))}

        <div className="workflow-connector"><ArrowDown weight="bold" /></div>
        <button type="button" className="workflow-card success-card">
          <span className="workflow-icon icon-success"><Check weight="bold" /></span>
          <span className="workflow-card-copy">
            <span className="workflow-step-meta"><small>Outcome</small><i>Success</i></span>
            <strong>Return {friendlyContractTitle(contract).toLocaleLowerCase()}</strong>
            <p>{facts.responseSchemas[0]?.label ?? "Send the resolved result back to the client."}</p>
          </span>
        </button>
      </div>

      <button
        type="button"
        className="error-path-toggle"
        onClick={() => setShowErrorPaths((current) => !current)}
      >
        {showErrorPaths ? <EyeSlash /> : <Eye />}
        {showErrorPaths ? "Hide error paths" : "Show error paths"}
      </button>
    </div>
  );
}

function nodeIcon(node: ContractNode) {
  if (node.kind === "middleware") return <ShieldCheck />;
  if (node.kind === "schema") return <FileText />;
  if (node.kind === "database") return <Database />;
  if (node.kind === "service" || node.kind === "helper") return <Gear />;
  if (node.kind === "external") return <Lightning />;
  return <CheckCircle />;
}
