import { describe, expect, it } from "vitest";

import {
  parseDockerfile,
  parseGitHubActions,
  parseNodeVersion,
  parseNvmrc,
  parsePackageJson,
  parseToolVersions,
} from "../src/parsers/index.js";

describe("source parsers", () => {
  it("reads package.json engines, devEngines, and Volta with precise locations", () => {
    const text = `{
  "engines": { "node": ">=20" },
  "devEngines": { "runtime": { "name": "node", "version": "^20" } },
  "volta": { "node": "20.11.1" }
}`;
    const result = parsePackageJson(text);
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence.map((item) => [item.source, item.constraint, item.location.line])).toEqual([
      ["package-engines", ">=20", 2],
      ["package-volta", "20.11.1", 4],
      ["package-dev-engines", "^20", 3],
    ]);
    expect(result.evidence.every((item) => item.location.column > 1)).toBe(true);
  });

  it("reports invalid package JSON instead of throwing", () => {
    const result = parsePackageJson('{ "engines": ', "package.json");
    expect(result.evidence).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("invalid-package-json");
  });

  it("reads version manager files", () => {
    expect(parseNvmrc("# comment\nv20.11.1\n").evidence[0]?.constraint).toBe("v20.11.1");
    expect(parseNodeVersion("20.11.1 # current\n").evidence[0]?.constraint).toBe("20.11.1");
    expect(parseToolVersions("python 3.12.0\nnodejs 20.11.1 22.2.0\n").evidence.map((item) => item.constraint)).toEqual([
      "20.11.1",
      "22.2.0",
    ]);
  });

  it("resolves Docker ARG values and records stages", () => {
    const result = parseDockerfile("ARG NODE_VERSION=20.11.1\nFROM node:${NODE_VERSION}-alpine AS app\nFROM nginx:alpine\n");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      role: "production",
      constraint: "20.11.1",
      context: "stage app",
      location: { line: 2 },
    });
  });

  it("resolves setup-node inline and block matrices", () => {
    const inline = `jobs:
  test:
    strategy:
      matrix:
        node: [20, "22.x"]
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
`;
    const result = parseGitHubActions(inline, ".github/workflows/ci.yml");
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence.map((item) => item.constraint)).toEqual(["20", "22.x"]);
    expect(result.evidence.map((item) => item.location.line)).toEqual([5, 5]);

    const block = inline.replace('node: [20, "22.x"]', "node:\n          - 20\n          - 22");
    expect(parseGitHubActions(block, "ci.yml").evidence.map((item) => item.constraint)).toEqual([
      "20",
      "22",
    ]);
  });

  it("resolves setup-node versions from matrix.include objects", () => {
    const text = `jobs:
  test:
    strategy:
      matrix:
        include:
          - node: 20
            os: ubuntu-latest
          - node: "22"
            os: windows-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
`;
    const result = parseGitHubActions(text, "ci.yml");
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence.map((item) => item.constraint)).toEqual(["20", "22"]);
    expect(result.evidence.map((item) => item.location.line)).toEqual([6, 8]);
  });

  it("does not treat unrelated matrix.include fields as Node versions", () => {
    const text = `jobs:
  test:
    strategy:
      matrix:
        include:
          - node: 20
            os: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.os }}
`;
    const result = parseGitHubActions(text, "ci.yml");
    expect(result.evidence).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("unresolved-actions-matrix");
  });
});
