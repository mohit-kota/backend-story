# Development plan

## Foundation objective

Create a local, deterministic path from an uploaded backend to a rendered graph:

```text
Folder selection
  -> source discovery
  -> Oxc parse
  -> extracted facts
  -> serializable analysis report
  -> Tauri command
  -> React graph projection
```

LLM annotations are not part of graph truth and are deferred.

## Milestone 0: Repository foundation

Status: Implemented in the initial scaffold.

- Rust workspace with separate core, CLI, and Tauri crates
- Pinned Oxc parser family
- Tauri 2 application shell
- React and React Flow viewer
- Shared serializable contract from Rust to TypeScript
- Project-local Rust toolchain declaration
- Read-only Ollama inventory

Exit check: frontend builds, Rust workspace builds, and the CLI can parse a
fixture once Rust is installed.

## Milestone 1: Reliable syntax inventory

Status: Partially implemented.

- Add Oxc semantic analysis after the syntax pass.
- Extract variable and method symbols with stable IDs. Implemented for named
  functions, classes, class methods, and TypeBox schema declarations.
- Preserve byte and line spans for all facts. Implemented.
- Convert Oxc diagnostics into structured source spans.
- Add content hashes and incremental file reuse.
- Add cancellation and bounded worker concurrency.

Exit check: repeated analysis produces byte-identical normalized JSON.

## Milestone 2: Elysia adapter

Status: Initial implementation complete for static route definitions.

- Resolve nested `.group()` path prefixes. Implemented.
- Extract HTTP method, full route path, handler span, summary metadata, and
  source evidence. Implemented.
- Resolve handler schema references for body, query, params, and response.
  Implemented through symbol matching.
- Determine effective Auth or AdminAuth composition. Implemented for `.use()`
  chains.
- Represent unresolved dynamic route paths explicitly.

Exit check: a reviewed route inventory matches representative Elysia fixtures.

## Milestone 3: Service and Prisma resolution

Status: Initial deterministic resolver implemented.

- Resolve imports, re-exports, classes, and static method calls. Class/static
  method matching is implemented; full alias and re-export resolution remains.
- Connect handlers to service methods. Implemented.
- Parse Prisma schema fields, relations, keys, indexes, and enums robustly.
- Resolve `prisma.<model>.<operation>` calls to schema models. Implemented.
- Classify reads and writes. Transaction boundaries and soft-delete evidence
  remain.

Exit check: `GET /discount` renders from route to validator, service, Prisma
operations, and schema models with source evidence on every edge.

## Milestone 4: Durable graph and incremental updates

- Introduce SQLite migrations.
- Store versioned nodes, edges, spans, files, and diagnostics.
- Add stable IDs independent of line numbers.
- Add a debounced filesystem watcher.
- Reparse changed files and invalidate only affected facts.
- Emit revisioned `GraphPatch` updates to the viewer.

Exit check: editing one service file does not rebuild unrelated modules.

## Milestone 5: Production viewer foundation

Status: Interactive contract viewer implemented; bounded slice transport and
accessibility expansion remain.

- Request bounded graph slices instead of complete analysis reports.
- Add module, route, model, auth, and diagnostics views.
- Add expand, collapse, search, filters, and source excerpts.
- Preserve manual positions separately from semantic graph data.
- Add node limits and visible truncation states.
- Add keyboard navigation and accessible node details.

Exit check: the viewer remains responsive with 500 visible nodes.

## Milestone 6: Local model enrichment

- Keep Ollama behind an `AnnotationProvider` trait.
- Use a generative model only on bounded, source-linked subgraphs.
- Validate output against a strict annotation schema.
- Store annotations separately from compiler facts.
- Invalidate annotations when contributing source hashes change.
- Use the installed embedding model for semantic retrieval if benchmarks show
  it improves route or workflow search.

Exit check: disabling Ollama does not remove or change the authoritative graph.

## Immediate next tasks

1. Capture golden contract fixtures for `GET /discount`, an AdminAuth mutation,
   a transaction-heavy route, and a direct-Prisma route.
2. Resolve import aliases, barrel re-exports, and transaction-client aliases.
3. Add explicit branch/condition facts for early returns and authorization
   fallbacks.
4. Move full-project results behind bounded contract-slice Tauri commands.
5. Add a source excerpt command and native editor/file reveal action.
6. Add stable truncation markers when a contract hits its relation budget.
7. Add Ollama annotations only after the compiler graph has golden coverage.
