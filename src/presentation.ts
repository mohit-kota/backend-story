import type { ApiContract, ContractNode } from "./types";

export type ViewMode = "contract" | "workflow" | "relations" | "data";

export type ContractFacts = {
  title: string;
  protected: boolean;
  readsData: boolean;
  writesData: boolean;
  requestSchemas: ContractNode[];
  responseSchemas: ContractNode[];
  workflowNodes: ContractNode[];
};

const GENERIC_SUMMARIES = new Set([
  "api contract",
  "api execution contract",
  "resolved backend contract",
]);

export function contractFacts(contract: ApiContract): ContractFacts {
  const endpointId = contract.nodes.find((node) => node.kind === "endpoint")?.id;
  const requestSchemaIds = new Set(
    contract.edges
      .filter((edge) => edge.kind === "usesSchema" && edge.target === endpointId)
      .map((edge) => edge.source),
  );
  const responseSchemaIds = new Set(
    contract.edges.filter((edge) => edge.kind === "returns").map((edge) => edge.target),
  );

  return {
    title: friendlyContractTitle(contract),
    protected: contract.nodes.some((node) => node.kind === "middleware"),
    readsData: contract.edges.some((edge) => edge.kind === "reads"),
    writesData: contract.edges.some((edge) => edge.kind === "writes"),
    requestSchemas: contract.nodes.filter((node) => requestSchemaIds.has(node.id)),
    responseSchemas: contract.nodes.filter((node) => responseSchemaIds.has(node.id)),
    workflowNodes: contract.nodes
      .filter(
        (node) =>
          node.kind !== "endpoint" &&
          !responseSchemaIds.has(node.id) &&
          (node.kind !== "schema" || requestSchemaIds.has(node.id)),
      )
      .sort((left, right) => left.order - right.order),
  };
}

export function friendlyContractTitle(contract: ApiContract): string {
  const summary = contract.summary?.trim();
  if (summary && !GENERIC_SUMMARIES.has(summary.toLocaleLowerCase())) {
    return sentenceCase(summary);
  }

  const segments = contract.path
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(":") && !segment.startsWith("{"));
  const resource = humanize(segments.at(-1) ?? "resource").toLocaleLowerCase();
  const verb = methodVerb(contract.method);
  return sentenceCase(`${verb} ${resource}`);
}

export function contractDescription(contract: ApiContract): string {
  const facts = contractFacts(contract);
  const effects: string[] = [];
  if (facts.readsData) effects.push("reads the information it needs");
  if (facts.writesData) effects.push("updates stored data");
  if (facts.responseSchemas.length > 0) effects.push("returns a structured response");
  if (effects.length === 0) effects.push("runs the resolved backend logic");
  return `${facts.title}. This action ${effects.join(", then ")}.`;
}

export function clientAction(contract: ApiContract): string {
  const title = friendlyContractTitle(contract).toLocaleLowerCase();
  const [verb, ...rest] = title.split(" ");
  const subject = rest.join(" ") || "this backend action";
  if (verb === "get") return `requests ${subject}`;
  if (verb === "create") return `creates ${subject}`;
  if (verb === "update") return `updates ${subject}`;
  if (verb === "remove" || verb === "delete") return `removes ${subject}`;
  return `runs ${title}`;
}

export function domainLabel(contract: ApiContract): string {
  const firstSegment = contract.path.split("/").filter(Boolean)[0] ?? "other";
  return humanize(firstSegment);
}

export function stepTitle(node: ContractNode): string {
  const lower = node.label.toLocaleLowerCase();
  if (node.kind === "middleware" && /auth|session|guard/.test(lower)) {
    return "Confirm the user is signed in";
  }
  if (node.kind === "middleware") return `Pass the ${humanize(node.label)} check`;
  if (node.kind === "schema") {
    return /response|result|output/.test(lower)
      ? "Prepare the response"
      : "Check the request information";
  }
  if (node.kind === "database") {
    const [model = "data", operation = "read"] = node.label.split(".");
    if (/create/.test(operation)) return `Create a ${humanize(model).toLocaleLowerCase()}`;
    if (/update|upsert/.test(operation)) return `Update ${humanize(model).toLocaleLowerCase()}`;
    if (/delete/.test(operation)) return `Remove ${humanize(model).toLocaleLowerCase()}`;
    return `Find ${pluralize(humanize(model).toLocaleLowerCase())}`;
  }
  if (node.kind === "external") return `Contact ${humanize(node.label)}`;

  const methodName = node.label.split(".").at(-1) ?? node.label;
  return sentenceCase(humanize(methodName));
}

export function stepDescription(node: ContractNode): string {
  if (node.kind === "middleware") {
    return "Make sure this request is allowed to continue before business logic runs.";
  }
  if (node.kind === "schema") {
    return "Validate the shape of the information moving through this API.";
  }
  if (node.kind === "database") {
    return node.detail.replaceAll("`", "");
  }
  if (node.kind === "service") {
    return "Apply the backend's business rules for this action.";
  }
  if (node.kind === "helper") {
    return "Prepare or transform information needed by the next action.";
  }
  if (node.kind === "external") {
    return "Send information to a service outside this backend.";
  }
  return node.detail;
}

export function stepCategory(node: ContractNode): string {
  if (node.kind === "endpoint") return "Contract";
  if (node.kind === "middleware") return "Authorization";
  if (node.kind === "schema") return "Validate input";
  if (node.kind === "database") {
    return /create|update|upsert|delete/.test(node.label) ? "Write database" : "Read database";
  }
  if (node.kind === "external") return "External call";
  if (node.kind === "helper") return "Transform";
  return "Business logic";
}

export function sentenceCase(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? `${normalized[0]?.toLocaleUpperCase()}${normalized.slice(1)}` : value;
}

export function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function sourceLabel(node: ContractNode, contract: ApiContract): string {
  const file = node.filePath ?? contract.filePath;
  if (!node.span?.startLine) return file;
  const end = node.span.endLine ?? node.span.startLine;
  return end === node.span.startLine
    ? `${file}:${node.span.startLine}`
    : `${file}:${node.span.startLine}–${end}`;
}

function methodVerb(method: string): string {
  if (method === "POST") return "Create";
  if (method === "PUT" || method === "PATCH") return "Update";
  if (method === "DELETE") return "Remove";
  return "Get";
}

function pluralize(value: string): string {
  if (value.endsWith("s")) return value;
  if (value.endsWith("y")) return `${value.slice(0, -1)}ies`;
  return `${value}s`;
}
