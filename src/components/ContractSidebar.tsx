import {
  BookOpenText,
  CaretDown,
  CheckCircle,
  Database,
  FolderSimple,
  MagnifyingGlass,
  SquaresFour,
} from "@phosphor-icons/react";

import { contractFacts, domainLabel, friendlyContractTitle } from "../presentation";
import type { ApiContract } from "../types";

type ContractSidebarProps = {
  contracts: ApiContract[];
  selectedContract: ApiContract | null;
  filter: string;
  projectRoot: string;
  totalFiles: number;
  onFilterChange: (value: string) => void;
  onSelectContract: (contract: ApiContract) => void;
};

export function ContractSidebar({
  contracts,
  selectedContract,
  filter,
  projectRoot,
  totalFiles,
  onFilterChange,
  onSelectContract,
}: ContractSidebarProps) {
  const groupedContracts = contracts.reduce<Map<string, ApiContract[]>>((groups, contract) => {
    const domain = domainLabel(contract);
    const values = groups.get(domain) ?? [];
    values.push(contract);
    groups.set(domain, values);
    return groups;
  }, new Map());

  return (
    <aside className="contract-sidebar" aria-label="API contracts">
      <div className="project-identity">
        <span className="project-icon"><SquaresFour weight="fill" /></span>
        <div>
          <strong>{projectName(projectRoot)}</strong>
          <span>Rust backend</span>
        </div>
        <CaretDown aria-hidden="true" />
      </div>

      <nav className="sidebar-nav" aria-label="Analyzer sections">
        <button type="button"><BookOpenText /> Overview</button>
        <p>API actions</p>
      </nav>

      <label className="contract-search">
        <MagnifyingGlass aria-hidden="true" />
        <input
          aria-label="Filter API contracts"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Search actions…"
        />
      </label>

      <div className="contract-list">
        {[...groupedContracts.entries()].map(([domain, domainContracts]) => (
          <section className="contract-group" key={domain}>
            <h2>{domain}</h2>
            {domainContracts.map((contract) => {
              const facts = contractFacts(contract);
              return (
                <button
                  type="button"
                  key={contract.id}
                  className={contract.id === selectedContract?.id ? "is-selected" : ""}
                  onClick={() => onSelectContract(contract)}
                >
                  <span className="selection-rail" />
                  <span className="contract-copy">
                    <strong>{friendlyContractTitle(contract)}</strong>
                    <span className="contract-route">
                      <i className={`method-badge method-${contract.method.toLowerCase()}`}>
                        {contract.method}
                      </i>
                      <small>{contract.path}</small>
                    </span>
                    {contract.id === selectedContract?.id ? (
                      <span className="contract-flags">
                        {facts.protected ? <em>Protected</em> : <em>Public</em>}
                        {facts.writesData ? <em>Changes data</em> : facts.readsData ? <em>Reads data</em> : null}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
        {contracts.length === 0 ? <p className="no-results">No matching API actions.</p> : null}
      </div>

      <div className="analysis-summary">
        <CheckCircle weight="fill" />
        <div>
          <strong>Analysis complete</strong>
          <span>{contracts.length} actions · {totalFiles} files</span>
        </div>
      </div>

      <button type="button" className="documentation-link">
        <FolderSimple /> Project files
      </button>
    </aside>
  );
}

function projectName(root: string): string {
  const normalized = root.replace(/\/$/, "");
  return normalized.split("/").at(-1) || "backend-project";
}
