import { describe, expect, it } from "vitest";

import { analyzeEvidence } from "../src/analyzer.js";
import { formatPretty } from "../src/formatters.js";
import { createEvidence, type RuntimeEvidence, type RuntimeRole } from "../src/types.js";

function evidence(
  constraint: string,
  role: RuntimeRole,
  file: string,
  label = file,
): RuntimeEvidence {
  return createEvidence({
    role,
    source: role === "support" ? "package-engines" : "nvmrc",
    location: { file, line: 1, column: 1 },
    raw: constraint,
    constraint,
    label,
  });
}

describe("role-aware analysis", () => {
  it("rejects a selected runtime entirely outside the support policy", () => {
    const result = analyzeEvidence([
      evidence(">=20", "support", "package.json", "engines.node"),
      evidence("18", "production", "Dockerfile", "Docker image"),
    ]);
    expect(result.status).toBe("incompatible");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unsupported-runtime", severity: "error" }),
    );
  });

  it("warns when a configured range only partly fits the support policy", () => {
    const result = analyzeEvidence([
      evidence(">=20 <23", "support", "package.json", "engines.node"),
      evidence(">=18", "development", ".nvmrc", "local runtime"),
    ]);
    expect(result.status).toBe("warning");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "partially-unsupported-runtime" }),
    );
  });

  it("reports two contradictory local selectors even when both are supported", () => {
    const result = analyzeEvidence([
      evidence(">=20", "support", "package.json", "engines.node"),
      evidence("20", "development", ".nvmrc"),
      evidence("22", "development", ".node-version"),
    ]);
    expect(result.status).toBe("warning");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "conflicting-role-selectors" }),
    );
  });

  it("allows disjoint CI matrix entries inside one support range", () => {
    const result = analyzeEvidence([
      evidence(">=20", "support", "package.json", "engines.node"),
      evidence("20", "test", "ci.yml", "CI matrix"),
      evidence("22", "test", "ci.yml", "CI matrix"),
    ]);
    expect(result.status).toBe("aligned");
  });

  it("allows alternative versions declared by one source file", () => {
    const first = evidence("20", "development", ".tool-versions");
    const second = evidence("22", "development", ".tool-versions");
    first.source = "tool-versions";
    second.source = "tool-versions";
    const result = analyzeEvidence([
      evidence(">=20", "support", "package.json", "engines.node"),
      first,
      second,
    ]);
    expect(result.status).toBe("aligned");
  });

  it("finds conflicting support contracts", () => {
    const result = analyzeEvidence([
      evidence("^18", "support", "package.json", "engines.node"),
      evidence(">=20", "support", "package.json", "another support policy"),
    ]);
    expect(result.status).toBe("incompatible");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "conflicting-support-ranges" }),
    );
  });

  it("reports an empty repository honestly", () => {
    const result = analyzeEvidence([]);
    expect(result.status).toBe("empty");
    expect(result.diagnostics[0]?.code).toBe("no-runtime-evidence");
  });

  it("uses singular grammar for a one-source result", () => {
    const result = analyzeEvidence([
      evidence(">=20", "support", "package.json", "engines.node"),
    ]);
    expect(formatPretty(result)).toContain("1 Node.js runtime source agrees");
  });
});
