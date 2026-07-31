import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyzeEvidence } from "../src/analyzer.js";
import { formatGithub, formatJson, formatPretty, shouldFail } from "../src/formatters.js";
import { inspectProject } from "../src/inspect.js";
import { scanProject } from "../src/scanner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => path.join(here, "fixtures", name);

describe("project inspection", () => {
  it("reports a fully aligned repository", async () => {
    const result = await inspectProject({ cwd: fixture("aligned") });
    expect(result.status).toBe("aligned");
    expect(result.summary.errors).toBe(0);
    expect(result.evidence.map((item) => item.role)).toEqual(
      expect.arrayContaining(["support", "development", "production", "test"]),
    );
  });

  it("finds a production runtime outside engines.node", async () => {
    const result = await inspectProject({ cwd: fixture("drifted") });
    expect(result.status).toBe("incompatible");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported-runtime",
          severity: "error",
          location: expect.objectContaining({ file: "Dockerfile", line: 1 }),
        }),
      ]),
    );
    expect(shouldFail(result)).toBe(true);
    expect(shouldFail(result, "never")).toBe(false);
  });

  it("is root-scoped and ignores nested package.json files", async () => {
    const scan = await scanProject({ cwd: fixture("aligned") });
    expect(scan.files).not.toContain("packages/legacy/package.json");
    expect(scan.evidence.some((item) => item.constraint === "10")).toBe(false);
  });

  it("warns for unresolved aliases without claiming incompatibility", () => {
    const result = analyzeEvidence([
      {
        id: "support",
        runtime: "node",
        role: "support",
        source: "package-engines",
        label: "engines.node",
        raw: ">=20",
        constraint: ">=20",
        location: { file: "package.json", line: 2, column: 12 },
      },
      {
        id: "nvm",
        runtime: "node",
        role: "development",
        source: "nvmrc",
        label: ".nvmrc",
        raw: "lts/*",
        constraint: "lts/*",
        location: { file: ".nvmrc", line: 1, column: 1 },
      },
    ]);
    expect(result.status).toBe("warning");
    expect(result.diagnostics[0]?.code).toBe("unrecognized-version");
  });

  it("emits stable pretty, JSON, and GitHub annotation formats", async () => {
    const result = await inspectProject({ cwd: fixture("drifted") });
    expect(formatPretty(result)).toContain("RuntimeTruth");
    expect(formatPretty(result)).toContain("Dockerfile:1:");
    expect(JSON.parse(formatJson(result))).toMatchObject({ status: "incompatible" });
    expect(formatGithub(result)).toContain("::error file=Dockerfile,line=1,col=");
  });
});
