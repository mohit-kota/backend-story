import { Database, FileText, GitBranch, ShareNetwork } from "@phosphor-icons/react";

import type { ViewMode } from "../presentation";

type ViewTabsProps = {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
};

const TABS: Array<{
  value: ViewMode;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  { value: "contract", label: "Contract", description: "What it receives and returns", icon: FileText },
  { value: "workflow", label: "Workflow", description: "What happens step by step", icon: GitBranch },
  { value: "relations", label: "Relations", description: "What it depends on", icon: ShareNetwork },
  { value: "data", label: "Data access", description: "Queries and round trips", icon: Database },
];

export function ViewTabs({ value, onChange }: ViewTabsProps) {
  return (
    <div className="view-tabs" role="tablist" aria-label="Contract views">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={value === tab.value}
            className={value === tab.value ? "is-active" : ""}
            onClick={() => onChange(tab.value)}
          >
            <Icon aria-hidden="true" />
            <span>
              <strong>{tab.label}</strong>
              <small>{tab.description}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
