# RuntimeTruth roadmap

RuntimeTruth's north star is simple: **catch a runtime contradiction before a person has to debug it**.

The roadmap is ordered by confidence, not hype. Dates are deliberately omitted; each phase should earn trust before the next one expands the surface area.

## Now — make Node.js detection trustworthy

- Validate common `package.json` declarations and version files.
- Cover Docker multi-stage builds and explicit GitHub Actions matrices.
- Minimize false positives with role-aware compatibility rules.
- Produce stable, actionable diagnostics with file context.
- Exercise the CLI on Windows, macOS, and Linux.
- Document unresolved or dynamic declarations instead of guessing.

## Next — fit naturally into developer workflows

- Machine-readable JSON output.
- GitHub annotations and a concise job summary.
- An explain mode that shows how each compatibility decision was reached.
- Ignore controls for generated or intentionally divergent files.
- Better workspace and monorepo discovery.
- Suggested edits, initially as dry-run output.

## Later — carefully add runtimes

Additional runtimes will share a common evidence model but ship independently, with fixtures and maintainers who understand their ecosystems.

- Python
- Go
- Ruby
- Java
- Package-manager and runtime coupling where it materially affects correctness

## Explicitly not planned right now

- A hosted dashboard or required account.
- Telemetry or source-code uploads.
- Executing repository scripts to infer configuration.
- Automatic commits or silent file rewrites.
- Generic linting unrelated to runtime compatibility.

## How priorities change

Real examples beat abstract votes. If a roadmap item would have prevented an actual failure, open an issue with a minimal, anonymized fixture and explain the impact. See [CONTRIBUTING.md](CONTRIBUTING.md) for the preferred format.
