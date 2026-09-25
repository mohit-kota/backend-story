import {
  BracketsCurly,
  Brain,
  FolderOpen,
  LockKey,
  Play,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { analyzeProject, getOllamaStatus, selectProjectFolder } from "./api";
import { ContractOverview } from "./components/ContractOverview";
import { ContractSidebar } from "./components/ContractSidebar";
import { DataAccessView } from "./components/DataAccessView";
import { InspectorPanel } from "./components/InspectorPanel";
import { RelationsView } from "./components/RelationsView";
import { ViewTabs } from "./components/ViewTabs";
import { WorkflowView } from "./components/WorkflowView";
import { DEMO_REPORT } from "./demo";
import {
  contractDescription,
  contractFacts,
  friendlyContractTitle,
  type ViewMode,
} from "./presentation";
import type { AnalysisReport, ApiContract, ContractNode, OllamaStatus } from "./types";

const EMPTY_OLLAMA: OllamaStatus = {
  installed: false,
  running: false,
  models: [],
  selectedModel: null,
  annotationReady: false,
  message: "Ollama status has not been loaded",
};

const IS_DEMO = new URLSearchParams(window.location.search).has("demo");

export default function App() {
  const [projectPath, setProjectPath] = useState(
    () => window.localStorage.getItem("backend-story:last-project") ?? "",
  );
  const [report, setReport] = useState<AnalysisReport | null>(IS_DEMO ? DEMO_REPORT : null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    IS_DEMO ? DEMO_REPORT.contracts[0]?.id ?? null : null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    IS_DEMO ? DEMO_REPORT.contracts[0]?.nodes[0]?.id ?? null : null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("contract");
  const [filter, setFilter] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ollama, setOllama] = useState<OllamaStatus>(EMPTY_OLLAMA);

  useEffect(() => {
    getOllamaStatus().then(setOllama).catch(() => setOllama(EMPTY_OLLAMA));
  }, []);

  const selectedContract = useMemo<ApiContract | null>(() => {
    if (!report) return null;
    return report.contracts.find((contract) => contract.id === selectedContractId) ?? report.contracts[0] ?? null;
  }, [report, selectedContractId]);

  const filteredContracts = useMemo(() => {
    if (!report) return [];
    const normalized = filter.trim().toLocaleLowerCase();
    if (!normalized) return report.contracts;
    return report.contracts.filter((contract) =>
      `${contract.method} ${contract.path} ${contract.summary ?? ""}`.toLocaleLowerCase().includes(normalized),
    );
  }, [filter, report]);

  const selectedNode = useMemo<ContractNode | null>(() => {
    if (!selectedContract || !selectedNodeId) return null;
    return selectedContract.nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [selectedContract, selectedNodeId]);

  const selectedRelations = useMemo(() => {
    if (!selectedContract || !selectedNode) return [];
    return selectedContract.edges.filter(
      (edge) => edge.source === selectedNode.id || edge.target === selectedNode.id,
    );
  }, [selectedContract, selectedNode]);

  async function chooseFolder() {
    setError(null);
    try {
      const selection = await selectProjectFolder();
      if (selection) setProjectPath(selection);
    } catch (selectionError) {
      setError(String(selectionError));
    }
  }

  async function runAnalysis() {
    const root = projectPath.trim();
    if (!root) {
      setError("Select or enter a backend directory first");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    try {
      const nextReport = await analyzeProject(root);
      const firstContract = nextReport.contracts[0] ?? null;
      setReport(nextReport);
      setSelectedContractId(firstContract?.id ?? null);
      setSelectedNodeId(firstContract?.nodes.find((node) => node.kind === "endpoint")?.id ?? null);
      setViewMode("contract");
      window.localStorage.setItem("backend-story:last-project", root);
    } catch (analysisError) {
      setError(String(analysisError));
    } finally {
      setIsAnalyzing(false);
    }
  }

  function selectContract(contract: ApiContract) {
    setSelectedContractId(contract.id);
    setSelectedNodeId(contract.nodes.find((node) => node.kind === "endpoint")?.id ?? null);
    setViewMode("contract");
  }

  function changeView(nextMode: ViewMode) {
    setViewMode(nextMode);
    if (!selectedContract) return;
    setSelectedNodeId(selectedContract.nodes.find((node) => node.kind === "endpoint")?.id ?? null);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark"><BracketsCurly weight="bold" /></span>
          <div>
            <h1>Backend Story</h1>
            <p>Understand your backend, one action at a time</p>
          </div>
        </div>
        <div className="project-controls">
          <button type="button" className="button button-secondary" onClick={chooseFolder}>
            <FolderOpen /> Choose backend
          </button>
          <input
            aria-label="Backend directory"
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
            placeholder="/path/to/backend"
          />
          <button type="button" className="button button-primary" onClick={runAnalysis} disabled={isAnalyzing}>
            {isAnalyzing ? <SpinnerGap className="spin" /> : <Play weight="fill" />}
            {isAnalyzing ? "Analyzing…" : "Analyze"}
          </button>
        </div>
        <div className={`ollama-status ${ollama.annotationReady ? "is-ready" : ""}`} title={ollama.message}>
          <Brain />
          <span>{ollama.selectedModel ?? "Labels off"}</span>
        </div>
      </header>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      {report && selectedContract ? (
        <section className="contract-workspace">
          <ContractSidebar
            contracts={filteredContracts}
            selectedContract={selectedContract}
            filter={filter}
            projectRoot={report.root}
            totalFiles={report.summary.totalFiles}
            onFilterChange={setFilter}
            onSelectContract={selectContract}
          />

          <section className="contract-main">
            <header className="contract-header">
              <div className="contract-heading-row">
                <div>
                  <span className="contract-title-line">
                    <h2>{friendlyContractTitle(selectedContract)}</h2>
                    <i className={`method-badge method-${selectedContract.method.toLowerCase()}`}>{selectedContract.method}</i>
                    <code>{selectedContract.path}</code>
                  </span>
                  <p>{contractDescription(selectedContract)}</p>
                </div>
                <ContractBadges contract={selectedContract} />
              </div>
              <ViewTabs value={viewMode} onChange={changeView} />
            </header>

            <div className="contract-view">
              {viewMode === "contract" ? (
                <ContractOverview contract={selectedContract} onOpenWorkflow={() => changeView("workflow")} />
              ) : null}
              {viewMode === "workflow" ? (
                <WorkflowView contract={selectedContract} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
              ) : null}
              {viewMode === "relations" ? (
                <RelationsView
                  contract={selectedContract}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  onClearSelection={() => setSelectedNodeId(null)}
                />
              ) : null}
              {viewMode === "data" ? (
                <DataAccessView
                  contract={selectedContract}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  aiModel={ollama.annotationReady ? ollama.selectedModel : null}
                />
              ) : null}
            </div>
          </section>

          <InspectorPanel
            node={selectedNode}
            contract={selectedContract}
            mode={viewMode}
            relations={selectedRelations}
            onClose={() => setSelectedNodeId(null)}
          />
        </section>
      ) : (
        <EmptyState onChoose={chooseFolder} />
      )}
    </main>
  );
}

function ContractBadges({ contract }: { contract: ApiContract }) {
  const facts = contractFacts(contract);
  return (
    <div className="contract-badges">
      <span className={facts.protected ? "badge-protected" : ""}><LockKey />{facts.protected ? "Protected" : "Public"}</span>
      {facts.writesData ? <span className="badge-write">Changes data</span> : null}
      {!facts.writesData && facts.readsData ? <span className="badge-read">Reads data</span> : null}
    </div>
  );
}

function EmptyState({ onChoose }: { onChoose: () => void }) {
  return (
    <section className="empty-state">
      <span className="empty-icon"><BracketsCurly weight="bold" /></span>
      <p className="section-kicker">Compiler-first backend explorer</p>
      <h2>Turn backend code into an understandable story</h2>
      <p>Choose a JavaScript or TypeScript backend. Oxc will find its API actions, workflows, data effects, and source evidence without running it.</p>
      <button type="button" className="button button-primary" onClick={onChoose}><FolderOpen /> Choose backend</button>
    </section>
  );
}
