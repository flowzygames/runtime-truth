import {
  intersectRangeSets,
  isRangeSubset,
  parseRange,
  rangesIntersect,
  type RangeSet,
} from "./semver.js";
import type {
  AnalysisResult,
  AnalysisStatus,
  Diagnostic,
  RuntimeEvidence,
  RuntimeRole,
} from "./types.js";

interface ParsedEvidence {
  evidence: RuntimeEvidence;
  range: RangeSet;
}

function diagnosticCounts(diagnostics: Diagnostic[]): Pick<AnalysisResult["summary"], "errors" | "warnings" | "infos"> {
  return {
    errors: diagnostics.filter((item) => item.severity === "error").length,
    warnings: diagnostics.filter((item) => item.severity === "warning").length,
    infos: diagnostics.filter((item) => item.severity === "info").length,
  };
}

function analysisStatus(evidence: RuntimeEvidence[], diagnostics: Diagnostic[]): AnalysisStatus {
  if (evidence.length === 0) return "empty";
  if (diagnostics.some((item) => item.severity === "error")) return "incompatible";
  if (diagnostics.some((item) => item.severity === "warning")) return "warning";
  return "aligned";
}

function locationLabel(evidence: RuntimeEvidence): string {
  return `${evidence.location.file}:${evidence.location.line}`;
}

function combinedSupport(
  support: ParsedEvidence[],
  diagnostics: Diagnostic[],
): RangeSet | null {
  if (support.length === 0) return null;
  let combined = support[0]!.range;
  let previous = support[0]!.evidence;
  for (const item of support.slice(1)) {
    const intersection = intersectRangeSets(combined, item.range);
    if (!intersection) {
      diagnostics.push({
        code: "conflicting-support-ranges",
        severity: "error",
        message: `Support ranges ${previous.constraint} (${locationLabel(previous)}) and ${item.evidence.constraint} (${locationLabel(item.evidence)}) do not overlap.`,
        location: item.evidence.location,
        related: [previous.location],
        evidenceIds: [previous.id, item.evidence.id],
      });
      return null;
    }
    combined = intersection;
    previous = item.evidence;
  }
  return combined;
}

function unionRanges(items: ParsedEvidence[]): RangeSet | null {
  if (items.length === 0) return null;
  return {
    source: items.map((item) => item.evidence.constraint).join(" || "),
    intervals: items.flatMap((item) => item.range.intervals),
  };
}

function diagnoseRoleDrift(parsed: ParsedEvidence[], diagnostics: Diagnostic[]): void {
  const roles: RuntimeRole[] = ["development", "production", "test"];
  const grouped = new Map<RuntimeRole, ParsedEvidence[]>();
  for (const role of roles) grouped.set(role, parsed.filter((item) => item.evidence.role === role));
  for (let leftIndex = 0; leftIndex < roles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < roles.length; rightIndex += 1) {
      const leftRole = roles[leftIndex]!;
      const rightRole = roles[rightIndex]!;
      const leftItems = grouped.get(leftRole) ?? [];
      const rightItems = grouped.get(rightRole) ?? [];
      const left = unionRanges(leftItems);
      const right = unionRanges(rightItems);
      if (!left || !right || rangesIntersect(left, right)) continue;
      const primary = rightItems[0]!.evidence;
      const related = leftItems[0]!.evidence;
      diagnostics.push({
        code: "role-drift",
        severity: "warning",
        message: `${rightRole} Node configuration (${right.source}) does not overlap ${leftRole} configuration (${left.source}). Add package.json engines.node to make the intended support policy explicit.`,
        location: primary.location,
        related: [related.location],
        evidenceIds: [...leftItems, ...rightItems].map((item) => item.evidence.id),
      });
    }
  }
}

function diagnoseConflictingSelectors(
  parsed: ParsedEvidence[],
  diagnostics: Diagnostic[],
): void {
  // A test matrix is expected to contain disjoint majors. Local selectors and
  // production images are different: two non-overlapping declarations for the
  // same role leave developers or deploys with two incompatible answers.
  const roles: RuntimeRole[] = ["development", "production"];
  for (const role of roles) {
    const items = parsed.filter((item) => item.evidence.role === role);
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex];
        const right = items[rightIndex];
        if (
          left.evidence.source === right.evidence.source &&
          left.evidence.location.file === right.evidence.location.file
        ) {
          continue;
        }
        if (rangesIntersect(left.range, right.range)) continue;
        diagnostics.push({
          code: "conflicting-role-selectors",
          severity: "warning",
          message: `${right.evidence.label} selects Node ${right.evidence.constraint}, which does not overlap ${left.evidence.label} (${left.evidence.constraint}) for the same ${role} role.`,
          location: right.evidence.location,
          related: [left.evidence.location],
          evidenceIds: [left.evidence.id, right.evidence.id],
        });
      }
    }
  }
}

export function analyzeEvidence(
  evidence: RuntimeEvidence[],
  options: { root?: string; diagnostics?: Diagnostic[] } = {},
): AnalysisResult {
  const diagnostics: Diagnostic[] = [...(options.diagnostics ?? [])];
  const parsed: ParsedEvidence[] = [];

  for (const item of evidence) {
    const range = parseRange(item.constraint);
    if (!range) {
      diagnostics.push({
        code: "unrecognized-version",
        severity: "warning",
        message: `Could not interpret ${JSON.stringify(item.raw)} from ${item.label} as a Node semver range.`,
        location: item.location,
        evidenceIds: [item.id],
      });
    } else {
      parsed.push({ evidence: item, range });
    }
  }

  const support = parsed.filter((item) => item.evidence.role === "support");
  const configured = parsed.filter((item) => item.evidence.role !== "support");
  const allowed = combinedSupport(support, diagnostics);

  if (support.length === 0 && evidence.length > 0) {
    diagnostics.push({
      code: "missing-support-policy",
      severity: "warning",
      message: "No package.json engines.node support policy was found; compatibility is inferred from configured environments.",
      location: evidence[0]!.location,
    });
    diagnoseRoleDrift(parsed, diagnostics);
  } else if (allowed) {
    const supportLocations = support.map((item) => item.evidence.location);
    const supportExpression = support.map((item) => item.evidence.constraint).join(" and ");
    for (const item of configured) {
      if (!rangesIntersect(item.range, allowed)) {
        diagnostics.push({
          code: "unsupported-runtime",
          severity: "error",
          message: `${item.evidence.label} selects Node ${item.evidence.constraint}, outside the supported range ${supportExpression}.`,
          location: item.evidence.location,
          related: supportLocations,
          evidenceIds: [item.evidence.id, ...support.map((value) => value.evidence.id)],
        });
      } else if (!isRangeSubset(item.range, allowed)) {
        diagnostics.push({
          code: "partially-unsupported-runtime",
          severity: "warning",
          message: `${item.evidence.label} allows Node ${item.evidence.constraint}, which extends outside the supported range ${supportExpression}.`,
          location: item.evidence.location,
          related: supportLocations,
          evidenceIds: [item.evidence.id, ...support.map((value) => value.evidence.id)],
        });
      }
    }
  }

  diagnoseConflictingSelectors(parsed, diagnostics);

  if (evidence.length === 0 && diagnostics.length === 0) {
    diagnostics.push({
      code: "no-runtime-evidence",
      severity: "warning",
      message: "No Node.js runtime configuration was found.",
    });
  }

  diagnostics.sort((a, b) => {
    const severity = { error: 0, warning: 1, info: 2 } as const;
    const severityOrder = severity[a.severity] - severity[b.severity];
    if (severityOrder !== 0) return severityOrder;
    const fileOrder = (a.location?.file ?? "").localeCompare(b.location?.file ?? "");
    if (fileOrder !== 0) return fileOrder;
    return (a.location?.line ?? 0) - (b.location?.line ?? 0);
  });

  const roles: AnalysisResult["summary"]["roles"] = {};
  for (const item of evidence) roles[item.role] = (roles[item.role] ?? 0) + 1;
  const counts = diagnosticCounts(diagnostics);
  return {
    runtime: "node",
    root: options.root ?? process.cwd(),
    status: analysisStatus(evidence, diagnostics),
    evidence,
    diagnostics,
    summary: { sources: evidence.length, ...counts, roles },
  };
}
