# Backend Story product roadmap

This roadmap explains the direction of Backend Story. It is a statement of
intent, not a delivery promise. Status labels describe what is available in the
open-source prototype today.

## Product thesis

Backend Story is an evidence-backed API improvement workbench for engineers
investigating unfamiliar, slow, complex, or high-volume APIs.

The product should answer one question:

> What should I improve in this API—and why?

Visualizations support that answer. They are not the product by themselves.

## Principles

- **Compiler facts are the foundation.** AI may explain evidence but cannot
  silently create graph truth.
- **Every finding must be inspectable.** Show files, lines, call paths, and the
  reasoning behind a confidence level.
- **Static and runtime evidence are different.** A source-level candidate only
  becomes a production priority when frequency and cost support it.
- **Safety boundaries matter.** Tenancy, authorization, transactions, and data
  freshness may justify code that appears redundant.
- **Local first.** Source analysis stays on the developer's machine unless the
  user explicitly connects another service.

## Product surface

Each API investigation is organized into five focused views:

1. **Overview** — contract, health, risks, and top opportunities
2. **Workflow** — execution order, branches, errors, and calls
3. **Data** — queries, duplicate reads, round trips, and transactions
4. **Production** — traffic, latency, errors, traces, and deployments
5. **Relations** — dependency exploration and blast radius

Grounded chat will remain available across views and cite the evidence it uses.

## Status at a glance

| Area | Status | Outcome |
| --- | --- | --- |
| Compiler and desktop foundation | In progress | Analyze locally and navigate source-backed API graphs |
| Data Access Analysis | In progress | Explain database operations and optimization candidates |
| Maintainability analysis | Planned | Find complexity and repeated behavior worth refactoring |
| Production context | Planned | Prioritize findings with real telemetry |
| Grounded chat | Planned | Ask questions and receive cited answers |
| Improvement verification | Planned | Compare before and after a change |

## Now — trustworthy static analysis

### Compiler and viewer foundation

Current prototype:

- Rust workspace with core, CLI, and Tauri crates
- Oxc parsing for TypeScript and JavaScript
- Elysia route and contract discovery
- Prisma schema and operation extraction
- Cross-file service and helper relationships
- Contract, Workflow, Relations, and Data views
- Source file and line evidence
- Optional local Ollama model detection

Exit criteria:

- A real backend can be analyzed without executing application code.
- An endpoint can be traced through resolved calls to source evidence.
- Unsupported or unresolved behavior is visible instead of guessed.
- Large graph slices remain usable in the native client.

### Data Access Analysis

Goal: turn a source graph into an actionable database-performance workflow.

Current prototype:

- Lists resolved Prisma operations for a selected API
- Classifies reads and writes
- Groups exact-expression duplicate-read candidates
- Surfaces lower-confidence same-model candidates for review
- Estimates resolved round trips and potential reuse savings
- Interprets supported Prisma calls as readable SQL-shaped previews
- Offers optional local-AI interpretation for unsupported dynamic details

Next work:

- Resolve database operations through aliases, re-exports, and transaction
  clients
- Preserve branch, loop, transaction, and parallel-execution context
- Track parameter lineage across service boundaries
- Detect database calls in loops and independent sequential awaits
- Distinguish exact, probable, and merely similar query fingerprints
- Allow findings to be accepted, dismissed, or marked intentional

Exit criteria:

- Every resolved database operation has source evidence and execution context.
- Repeated-read candidates show all call sites and comparable parameters.
- Round-trip savings remain clearly labelled as estimates.
- SQL previews remain clearly labelled as interpretations.

## Next — maintainability and production priority

### Maintainability and DRY analysis

- Method size, nesting, branching, and complexity indicators
- Dependency fan-out and likely change-risk indicators
- Repeated validation, authorization, query, and transformation patterns
- Suggested extraction boundaries with affected source locations
- Safety checks for tenant and transaction boundaries

The goal is not a generic score. It is a short, explainable list of changes an
engineer can evaluate.

### Production context, starting with Axiom

- Explicit local connection and dataset selection
- Endpoint mapping by method, normalized route, service, and environment
- Request volume and p50/p95/p99 latency
- Error rate and common failures
- Database and external-service spans
- Deployment or Git SHA comparison
- Static findings ranked by observed frequency and cost

All telemetry examples in demos must be labelled **Sample data**. The interface
must warn when source and telemetry refer to different deployments.

Exit criteria:

- A selected API shows production health for an explicit time window.
- Static database operations can be matched to spans when instrumentation
  provides enough evidence.
- Users can see why one finding is ranked above another.

## Later — grounded assistance and verification

### Grounded chat

- Explain an API to a new engineer
- Answer why an API may be slow
- Propose a safe refactoring sequence
- Cite source locations, findings, trace windows, and deployments
- State uncertainty when evidence is incomplete

The language model explains and synthesizes. Deterministic analysis and
telemetry remain the source of truth.

### Improvement workflow

- Repository-wide opportunity backlog
- Finding ownership and status
- Baseline and post-change comparisons
- Exportable investigation reports
- CI regression checks for selected deterministic detectors
- Additional observability providers behind a neutral connector interface

## Evidence model

Backend Story should visually distinguish:

| Evidence type | Example | Product wording |
| --- | --- | --- |
| Deterministic fact | Prisma call at a source span | “Compiler evidence” |
| Heuristic candidate | Similar reads in two services | “Candidate” |
| Static estimate | Potential round trips after reuse | “Estimate” |
| Runtime observation | p95 latency in a trace window | “Observed” |
| AI explanation | Plain-language query description | “AI interpretation” |

Every finding should include what was detected, why it may matter, source
evidence, confidence, estimated impact, a safe next step, and known caveats.

## Technical direction

```text
Source repository
      │
      ▼
Oxc + Prisma extraction
      │
      ▼
Canonical API intermediate representation
      │
      ├── call resolution and lightweight data flow
      ├── performance and maintainability detectors
      └── source evidence and confidence
      │
      ▼
Evidence graph ───────────┐
                         ├── views and grounded chat
Runtime facts (planned) ─┘
```

The canonical representation will model endpoints, execution steps, functions,
database and cache operations, external calls, branches, loops, parameter
lineage, transaction boundaries, source evidence, confidence, and resolution
provenance.

## Success measures

- Time from selecting an API to understanding its execution path
- Percentage of database operations resolved to source evidence
- Precision of duplicate-query candidates confirmed by engineers
- Findings that lead to a reviewed code change
- Measured latency or database-time improvement after accepted changes
- Percentage of chat answers with complete source and runtime citations

## Non-goals for the early project

- Automatically changing production code
- Replacing tracing, profilers, or database query planners
- Claiming exact runtime cost from static analysis
- Treating every repeated query as a defect
- Supporting every language and ORM before the TypeScript, Prisma, and Elysia
  path is reliable
- Using an LLM as the source of truth for code relationships

## How to contribute to the roadmap

Open an issue that describes the engineering question you need answered, the
evidence required to trust the answer, and a small representative code sample.
Proposals that improve deterministic resolution or make uncertainty clearer are
especially welcome.
