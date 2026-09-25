# Architecture

Backend Story is split into a deterministic Rust analyzer and a thin native
viewer. The analyzer owns facts; the UI owns presentation.

## End-to-end pipeline

```text
1. Select folder
      ↓
2. Discover supported source and schema files
      ↓
3. Parse TypeScript/JavaScript with Oxc
      ↓
4. Extract framework, symbol, call, and Prisma facts
      ↓
5. Resolve calls and build a canonical analysis report
      ↓
6. Project endpoint slices into Contract, Workflow, Relations, and Data views
      ↓
7. Optionally ask a local generative model to explain bounded evidence
```

The selected application is read as source text. Backend Story does not import,
build, or execute it.

## Workspace layout

```text
crates/analyzer-core/   Source discovery, Oxc extraction, relations, Prisma,
                        SQL interpretation, and serializable report models
crates/analyzer-cli/    Headless JSON report command
src-tauri/              Native commands, folder dialog, and Ollama adapter
src/                    React evidence views and graph projections
```

## Rust analyzer

`analyzer-core` is intentionally independent of Tauri. Its public boundary is a
serializable report so that the CLI, desktop app, tests, and future integrations
can consume the same facts.

The core performs these stages:

1. **Discovery** uses ignore-aware walking and accepts supported source files.
2. **Parsing** allocates one Oxc arena per file and records diagnostics.
3. **Fact extraction** records declarations, routes, middleware, calls, Prisma
   operations, and source spans.
4. **Resolution** connects calls where static evidence is sufficient and keeps
   unresolved behavior explicit.
5. **Projection** produces endpoint-centered nodes, edges, database operations,
   evidence, and diagnostics.

The parser and semantic adapters should never invent a relationship to make the
graph look complete.

## Tauri boundary

The native shell exposes a small command surface:

- analyze a selected project
- report local Ollama availability
- interpret a bounded Prisma operation with a local model

Filesystem access and HTTP access to Ollama stay behind Rust commands. The web
view receives structured data and does not read arbitrary files directly.

## Viewer

React renders several projections of the same endpoint report:

- **Contract** focuses on inputs, outputs, access, and source evidence.
- **Workflow** orders steps and makes control flow understandable.
- **Relations** explores what an endpoint depends on and touches.
- **Data** focuses on database operations, possible repeated reads, estimated
  round trips, and SQL-shaped interpretations.

These are not independent graphs. Preserving the selected endpoint and evidence
identity across views is a product invariant.

## Evidence and confidence

Every derived item should retain its provenance:

- source file and span
- extraction or resolution kind
- deterministic, heuristic, estimated, observed, or AI-interpreted status
- confidence and a reason when the item is not deterministic

A future persisted graph should store annotations separately from compiler
facts and invalidate them when contributing source hashes change.

## SQL interpretations

Static Prisma calls can often be expressed as readable SQL-shaped previews.
They are useful for understanding intent, but are not guaranteed to match the
database query generated at runtime. Exact SQL depends on provider behavior,
schema mappings, relation loading, selected fields, middleware, and runtime
values.

Observed SQL is a separate future evidence layer sourced from instrumentation.
The product must never present an interpretation as an observation.

## Local AI boundary

Ollama is optional. The app checks installed model metadata and excludes known
embedding-only models from generative actions. A model receives only the
bounded operation context needed for an explanation.

AI output must be:

- labelled as an interpretation
- stored separately from compiler facts
- dismissible without losing functionality
- invalidated when its evidence changes

## Scaling direction

The prototype returns a complete in-memory report. The planned production path
uses stable IDs, a versioned local store, incremental invalidation, bounded
endpoint slices, and revisioned graph patches. This keeps large projects usable
without weakening source evidence.

## Security and privacy

- Analysis is local by default.
- The selected backend is not executed.
- External connectors must be explicit and separately configured.
- Secrets and environment files should not be collected into reports.
- Source excerpts sent to an optional local model should be minimal and visible
  to the user.

See [SECURITY.md](../SECURITY.md) for vulnerability reporting.
