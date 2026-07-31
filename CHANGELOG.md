# Changelog

All notable changes to RuntimeTruth will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Gather feedback on real-world Node.js version patterns and false positives.

## [0.1.0] - 2026-07-30

### Added

- Zero-config `runtime-truth check` command.
- Discovery of Node.js declarations in package metadata, local version files, Dockerfiles, and GitHub Actions workflows.
- Role-aware compatibility checks across supported, selected, tested, build, and production runtimes.
- File-oriented diagnostics and CI-friendly exit status.
- GitHub Action for pull request checks.
- Explicit offline, no-telemetry operation.

[Unreleased]: https://github.com/flowzygames/runtime-truth/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/flowzygames/runtime-truth/releases/tag/v0.1.0
