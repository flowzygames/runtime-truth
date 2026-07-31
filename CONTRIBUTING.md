# Contributing to RuntimeTruth

Thanks for helping make runtime configuration less surprising. RuntimeTruth is small on purpose: correctness, clear diagnostics, and predictable behavior matter more than the number of formats it claims to support.

## Good first contributions

- Add an anonymized fixture for a real repository pattern.
- Improve an unclear diagnostic without changing its meaning.
- Add a Docker tag, GitHub Actions matrix, or version-file edge case.
- Improve documentation or cross-platform test coverage.
- Reproduce and minimize a reported false positive.

Issues labeled `good first issue` should be independently approachable. If an issue is not yet scoped, comment with your intended approach before investing substantial time.

## Development setup

You need Node.js 20 or newer and npm.

```sh
git clone https://github.com/flowzygames/runtime-truth.git
cd runtime-truth
npm ci
npm test
```

Before opening a pull request, run the repository's complete local checks:

```sh
npm run check
```

## How to make a parser change

Every new parsing behavior should include fixtures for both the expected case and at least one nearby case that must **not** match.

1. Reduce the input to the smallest representative file.
2. Remove organization names, image registries, secrets, and unrelated application code.
3. Add the fixture under `test/fixtures/`.
4. Add a focused test describing the source's role and expected version expression.
5. Keep parsing separate from compatibility decisions: parsers report evidence; the comparison layer decides whether evidence conflicts.

RuntimeTruth must not silently invent a version. When evidence is ambiguous, prefer an explicit unresolved result to a guess.

## Pull requests

Keep pull requests focused and explain the user-visible behavior. A good description includes:

- the repository pattern being handled;
- the previous output and the expected output;
- why the source should be classified as local, supported, tested, build, or production;
- tests for regressions and negative cases;
- documentation changes when behavior is user-facing.

By submitting a contribution, you agree that it may be distributed under the repository's MIT License.

## Commit style

Use short, imperative commit subjects when practical, such as `Handle quoted Node versions in .tool-versions`. Perfect history is not required; maintainers may squash commits when merging.

## Reporting bugs and security issues

Use the bug report template for ordinary defects. Include the smallest sanitized configuration files that reproduce the behavior and the exact CLI output.

Do not disclose vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md) to report them privately.

## Community

Be specific, patient, and kind. Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
