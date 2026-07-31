import path from "node:path";

import type {
  AnalysisResult,
  Diagnostic,
  FailOn,
  PrettyFormatOptions,
  RuntimeEvidence,
} from "./types.js";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  red: "\u001B[31m",
  yellow: "\u001B[33m",
  green: "\u001B[32m",
  cyan: "\u001B[36m",
};

function paint(value: string, code: string, enabled: boolean): string {
  return enabled ? `${code}${value}${ANSI.reset}` : value;
}

function relativeRoot(root: string, cwd?: string): string {
  if (!cwd) return root;
  const relative = path.relative(cwd, root);
  return relative || ".";
}

function statusLine(result: AnalysisResult, color: boolean): string {
  if (result.status === "aligned") {
    const verb = result.summary.sources === 1 ? "agrees" : "agree";
    return paint(
      `✓ Compatible — ${result.summary.sources} Node.js runtime source${result.summary.sources === 1 ? "" : "s"} ${verb} with the support policy.`,
      ANSI.green,
      color,
    );
  }
  if (result.status === "incompatible") {
    return paint(
      `✗ Incompatible — ${result.summary.errors} error${result.summary.errors === 1 ? "" : "s"} found.`,
      ANSI.red,
      color,
    );
  }
  if (result.status === "warning") {
    return paint(
      `! Needs attention — ${result.summary.warnings} warning${result.summary.warnings === 1 ? "" : "s"} found.`,
      ANSI.yellow,
      color,
    );
  }
  return paint("! No Node.js runtime configuration found.", ANSI.yellow, color);
}

function roleLabel(role: RuntimeEvidence["role"]): string {
  return role.padEnd(11, " ");
}

function evidenceLine(item: RuntimeEvidence, color: boolean): string {
  const location = `${item.location.file}:${item.location.line}:${item.location.column}`;
  const context = item.context ? ` (${item.context})` : "";
  return `  ${paint(roleLabel(item.role), ANSI.cyan, color)} ${item.constraint.padEnd(14, " ")} ${paint(location, ANSI.dim, color)}${context}`;
}

function diagnosticSymbol(diagnostic: Diagnostic): string {
  if (diagnostic.severity === "error") return "✗";
  if (diagnostic.severity === "warning") return "!";
  return "i";
}

function diagnosticLine(diagnostic: Diagnostic, color: boolean): string[] {
  const ansi = diagnostic.severity === "error" ? ANSI.red : diagnostic.severity === "warning" ? ANSI.yellow : ANSI.cyan;
  const location = diagnostic.location
    ? `${diagnostic.location.file}:${diagnostic.location.line}:${diagnostic.location.column}`
    : undefined;
  return [
    `  ${paint(diagnosticSymbol(diagnostic), ansi, color)} ${diagnostic.message}`,
    ...(location ? [`    ${paint(location, ANSI.dim, color)} · ${diagnostic.code}`] : []),
  ];
}

export function formatPretty(result: AnalysisResult, options: PrettyFormatOptions = {}): string {
  const color = options.color ?? false;
  const lines = [
    paint("RuntimeTruth", ANSI.bold, color),
    paint(`Node.js runtime alignment · ${relativeRoot(result.root, options.cwd)}`, ANSI.dim, color),
    "",
    statusLine(result, color),
  ];

  if (result.evidence.length > 0) {
    lines.push("", paint("Sources", ANSI.bold, color));
    lines.push(...result.evidence.map((item) => evidenceLine(item, color)));
  }

  if (result.diagnostics.length > 0) {
    lines.push("", paint("Findings", ANSI.bold, color));
    for (const diagnostic of result.diagnostics) lines.push(...diagnosticLine(diagnostic, color));
  }

  return `${lines.join("\n")}\n`;
}

export function formatJson(result: AnalysisResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function escapeCommandMessage(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeCommandProperty(value: string): string {
  return escapeCommandMessage(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function annotation(diagnostic: Diagnostic): string {
  const level = diagnostic.severity === "info" ? "notice" : diagnostic.severity;
  const properties: string[] = [`title=${escapeCommandProperty(`RuntimeTruth: ${diagnostic.code}`)}`];
  if (diagnostic.location) {
    properties.unshift(
      `file=${escapeCommandProperty(diagnostic.location.file)}`,
      `line=${diagnostic.location.line}`,
      `col=${diagnostic.location.column}`,
    );
  }
  return `::${level} ${properties.join(",")}::${escapeCommandMessage(diagnostic.message)}`;
}

export function formatGithub(result: AnalysisResult): string {
  const lines = result.diagnostics.map(annotation);
  if (result.diagnostics.length === 0) {
    lines.push(
      `::notice title=RuntimeTruth::${escapeCommandMessage(
        `${result.summary.sources} Node.js runtime sources are compatible.`,
      )}`,
    );
  }
  lines.push(
    `RuntimeTruth: ${result.status} (${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.sources} sources)`,
  );
  return `${lines.join("\n")}\n`;
}

export function shouldFail(result: AnalysisResult, failOn: FailOn = "error"): boolean {
  if (failOn === "never") return false;
  if (failOn === "warning") return result.summary.errors > 0 || result.summary.warnings > 0;
  return result.summary.errors > 0;
}
