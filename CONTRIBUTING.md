# Contributing to Backend Story

Thanks for helping make backend behavior easier to understand and improve.

## Before opening a change

- Search existing issues and discussions.
- For a new detector or adapter, describe the evidence that makes its result
  trustworthy and how unresolved cases will be represented.
- Keep pull requests focused. Large parser refactors and product changes should
  start with an issue.
- Never include proprietary source, secrets, telemetry, or personal data in a
  fixture.

## Local setup

Install Rust 1.96+, Bun 1.3+, and the Tauri 2 prerequisites for your operating
system.

```bash
git clone https://github.com/mohit-kota/backend-story.git
cd backend-story
bun install
bun run dev
```

Run the web-only demo with `bun run dev:web` and open
`http://127.0.0.1:1420/?demo=1`.

## Quality checks

Run these before submitting a pull request:

```bash
bun run check:web
bun run build:web
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Parser changes

Parser and resolver changes should include a minimal fixture and an assertion
for both the supported case and a nearby unresolved or ambiguous case. Preserve
source spans and deterministic output ordering.

If a detector is heuristic, its output must include confidence and evidence and
must not be worded as a proven defect.

## UI changes

Keep the distinction between compiler evidence, candidates, estimates, runtime
observations, and AI interpretations. Check the affected view at desktop and
narrow widths, and preserve keyboard access to interactive controls.

## Commit and pull request guidance

- Use a clear imperative commit subject.
- Explain the user problem, evidence model, and limitations in the pull request.
- Include screenshots for visible changes.
- Call out breaking report-schema changes.
- By contributing, you agree that your contribution is licensed under
  Apache-2.0.

## Community

Be respectful and constructive. Participation is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as
described in [SECURITY.md](SECURITY.md).
