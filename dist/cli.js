#!/usr/bin/env node

// src/cli.ts
import { realpathSync } from "fs";
import path3 from "path";
import { pathToFileURL } from "url";

// src/formatters.ts
import path from "path";
var ANSI = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  red: "\x1B[31m",
  yellow: "\x1B[33m",
  green: "\x1B[32m",
  cyan: "\x1B[36m"
};
function paint(value, code, enabled) {
  return enabled ? `${code}${value}${ANSI.reset}` : value;
}
function relativeRoot(root, cwd) {
  if (!cwd) return root;
  const relative = path.relative(cwd, root);
  return relative || ".";
}
function statusLine(result, color) {
  if (result.status === "aligned") {
    const verb = result.summary.sources === 1 ? "agrees" : "agree";
    return paint(
      `\u2713 Compatible \u2014 ${result.summary.sources} Node.js runtime source${result.summary.sources === 1 ? "" : "s"} ${verb} with the support policy.`,
      ANSI.green,
      color
    );
  }
  if (result.status === "incompatible") {
    return paint(
      `\u2717 Incompatible \u2014 ${result.summary.errors} error${result.summary.errors === 1 ? "" : "s"} found.`,
      ANSI.red,
      color
    );
  }
  if (result.status === "warning") {
    return paint(
      `! Needs attention \u2014 ${result.summary.warnings} warning${result.summary.warnings === 1 ? "" : "s"} found.`,
      ANSI.yellow,
      color
    );
  }
  return paint("! No Node.js runtime configuration found.", ANSI.yellow, color);
}
function roleLabel(role) {
  return role.padEnd(11, " ");
}
function evidenceLine(item, color) {
  const location = `${item.location.file}:${item.location.line}:${item.location.column}`;
  const context = item.context ? ` (${item.context})` : "";
  return `  ${paint(roleLabel(item.role), ANSI.cyan, color)} ${item.constraint.padEnd(14, " ")} ${paint(location, ANSI.dim, color)}${context}`;
}
function diagnosticSymbol(diagnostic) {
  if (diagnostic.severity === "error") return "\u2717";
  if (diagnostic.severity === "warning") return "!";
  return "i";
}
function diagnosticLine(diagnostic, color) {
  const ansi = diagnostic.severity === "error" ? ANSI.red : diagnostic.severity === "warning" ? ANSI.yellow : ANSI.cyan;
  const location = diagnostic.location ? `${diagnostic.location.file}:${diagnostic.location.line}:${diagnostic.location.column}` : void 0;
  return [
    `  ${paint(diagnosticSymbol(diagnostic), ansi, color)} ${diagnostic.message}`,
    ...location ? [`    ${paint(location, ANSI.dim, color)} \xB7 ${diagnostic.code}`] : []
  ];
}
function formatPretty(result, options = {}) {
  const color = options.color ?? false;
  const lines = [
    paint("RuntimeTruth", ANSI.bold, color),
    paint(`Node.js runtime alignment \xB7 ${relativeRoot(result.root, options.cwd)}`, ANSI.dim, color),
    "",
    statusLine(result, color)
  ];
  if (result.evidence.length > 0) {
    lines.push("", paint("Sources", ANSI.bold, color));
    lines.push(...result.evidence.map((item) => evidenceLine(item, color)));
  }
  if (result.diagnostics.length > 0) {
    lines.push("", paint("Findings", ANSI.bold, color));
    for (const diagnostic of result.diagnostics) lines.push(...diagnosticLine(diagnostic, color));
  }
  return `${lines.join("\n")}
`;
}
function formatJson(result) {
  return `${JSON.stringify(result, null, 2)}
`;
}
function escapeCommandMessage(value) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeCommandProperty(value) {
  return escapeCommandMessage(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
function annotation(diagnostic) {
  const level = diagnostic.severity === "info" ? "notice" : diagnostic.severity;
  const properties = [`title=${escapeCommandProperty(`RuntimeTruth: ${diagnostic.code}`)}`];
  if (diagnostic.location) {
    properties.unshift(
      `file=${escapeCommandProperty(diagnostic.location.file)}`,
      `line=${diagnostic.location.line}`,
      `col=${diagnostic.location.column}`
    );
  }
  return `::${level} ${properties.join(",")}::${escapeCommandMessage(diagnostic.message)}`;
}
function formatGithub(result) {
  const lines = result.diagnostics.map(annotation);
  if (result.diagnostics.length === 0) {
    lines.push(
      `::notice title=RuntimeTruth::${escapeCommandMessage(
        `${result.summary.sources} Node.js runtime sources are compatible.`
      )}`
    );
  }
  lines.push(
    `RuntimeTruth: ${result.status} (${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.sources} sources)`
  );
  return `${lines.join("\n")}
`;
}
function shouldFail(result, failOn = "error") {
  if (failOn === "never") return false;
  if (failOn === "warning") return result.summary.errors > 0 || result.summary.warnings > 0;
  return result.summary.errors > 0;
}

// src/semver.ts
var MIN_VERSION = { major: 0, minor: 0, patch: 0 };
function compareVersions(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}
function comparePrerelease(a, b) {
  const left = a.split(".");
  const right = b.split(".");
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const av = left[index];
    const bv = right[index];
    if (av === void 0) return -1;
    if (bv === void 0) return 1;
    if (av === bv) continue;
    const an = /^\d+$/.test(av) ? Number(av) : null;
    const bn = /^\d+$/.test(bv) ? Number(bv) : null;
    if (an !== null && bn !== null) return an < bn ? -1 : 1;
    if (an !== null) return -1;
    if (bn !== null) return 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}
function parsePartialVersion(value) {
  const cleaned = value.trim().replace(/^v(?=\d)/i, "");
  const match = cleaned.match(
    /^(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i
  );
  if (!match) return null;
  const part = (input) => input === void 0 || /^(?:x|\*)$/i.test(input) ? null : Number(input);
  const major = part(match[1]);
  const minor = part(match[2]);
  const patch = part(match[3]);
  if (major === null && (minor !== null || patch !== null)) return null;
  if (minor === null && patch !== null) return null;
  return { major, minor, patch, prerelease: match[4] };
}
function exactInterval(version) {
  return {
    lower: version,
    lowerInclusive: true,
    upper: version,
    upperInclusive: true
  };
}
function partialInterval(partial) {
  if (partial.major === null) return unboundedInterval();
  if (partial.minor === null) {
    return {
      lower: { major: partial.major, minor: 0, patch: 0 },
      lowerInclusive: true,
      upper: { major: partial.major + 1, minor: 0, patch: 0 },
      upperInclusive: false
    };
  }
  if (partial.patch === null) {
    return {
      lower: { major: partial.major, minor: partial.minor, patch: 0 },
      lowerInclusive: true,
      upper: { major: partial.major, minor: partial.minor + 1, patch: 0 },
      upperInclusive: false
    };
  }
  return exactInterval({
    major: partial.major,
    minor: partial.minor,
    patch: partial.patch,
    prerelease: partial.prerelease
  });
}
function unboundedInterval() {
  return { lower: null, lowerInclusive: false, upper: null, upperInclusive: false };
}
function nextPartialUpper(partial, operator) {
  const major = partial.major ?? 0;
  const minor = partial.minor ?? 0;
  const patch = partial.patch ?? 0;
  if (operator === "tilde") {
    if (partial.minor === null) return { major: major + 1, minor: 0, patch: 0 };
    return { major, minor: minor + 1, patch: 0 };
  }
  if (major > 0) return { major: major + 1, minor: 0, patch: 0 };
  if (minor > 0) return { major: 0, minor: minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: patch + 1 };
}
function expandToken(token) {
  const trimmed = token.trim();
  if (!trimmed || trimmed === "*" || /^x$/i.test(trimmed)) return unboundedInterval();
  const comparator = trimmed.match(/^(<=|>=|<|>|=|~\s*|\^\s*)?(.*)$/);
  if (!comparator) return null;
  const operator = (comparator[1] ?? "").replace(/\s/g, "");
  const partial = parsePartialVersion(comparator[2]);
  if (!partial || partial.major === null) {
    return operator === "" && partial ? unboundedInterval() : null;
  }
  const base = {
    major: partial.major,
    minor: partial.minor ?? 0,
    patch: partial.patch ?? 0,
    prerelease: partial.prerelease
  };
  if (operator === "^" || operator === "~") {
    return {
      lower: base,
      lowerInclusive: true,
      upper: nextPartialUpper(partial, operator === "^" ? "caret" : "tilde"),
      upperInclusive: false
    };
  }
  if (operator === "") return partialInterval(partial);
  if (operator === "=") return partialInterval(partial);
  if (operator === ">=") {
    return { lower: base, lowerInclusive: true, upper: null, upperInclusive: false };
  }
  if (operator === ">") {
    if (partial.minor === null) {
      return {
        lower: { major: partial.major + 1, minor: 0, patch: 0 },
        lowerInclusive: true,
        upper: null,
        upperInclusive: false
      };
    }
    if (partial.patch === null) {
      return {
        lower: { major: partial.major, minor: partial.minor + 1, patch: 0 },
        lowerInclusive: true,
        upper: null,
        upperInclusive: false
      };
    }
    return { lower: base, lowerInclusive: false, upper: null, upperInclusive: false };
  }
  if (operator === "<") {
    return { lower: null, lowerInclusive: false, upper: base, upperInclusive: false };
  }
  if (operator === "<=") {
    if (partial.minor === null) {
      return {
        lower: null,
        lowerInclusive: false,
        upper: { major: partial.major + 1, minor: 0, patch: 0 },
        upperInclusive: false
      };
    }
    if (partial.patch === null) {
      return {
        lower: null,
        lowerInclusive: false,
        upper: { major: partial.major, minor: partial.minor + 1, patch: 0 },
        upperInclusive: false
      };
    }
    return { lower: null, lowerInclusive: false, upper: base, upperInclusive: true };
  }
  return null;
}
function intersectIntervals(a, b) {
  const lower = laterLower(a, b);
  const upper = earlierUpper(a, b);
  const result = {
    lower: lower.value,
    lowerInclusive: lower.inclusive,
    upper: upper.value,
    upperInclusive: upper.inclusive
  };
  return intervalIsEmpty(result) ? null : result;
}
function laterLower(a, b) {
  if (!a.lower) return { value: b.lower, inclusive: b.lowerInclusive };
  if (!b.lower) return { value: a.lower, inclusive: a.lowerInclusive };
  const comparison = compareVersions(a.lower, b.lower);
  if (comparison > 0) return { value: a.lower, inclusive: a.lowerInclusive };
  if (comparison < 0) return { value: b.lower, inclusive: b.lowerInclusive };
  return { value: a.lower, inclusive: a.lowerInclusive && b.lowerInclusive };
}
function earlierUpper(a, b) {
  if (!a.upper) return { value: b.upper, inclusive: b.upperInclusive };
  if (!b.upper) return { value: a.upper, inclusive: a.upperInclusive };
  const comparison = compareVersions(a.upper, b.upper);
  if (comparison < 0) return { value: a.upper, inclusive: a.upperInclusive };
  if (comparison > 0) return { value: b.upper, inclusive: b.upperInclusive };
  return { value: a.upper, inclusive: a.upperInclusive && b.upperInclusive };
}
function intervalIsEmpty(interval) {
  if (!interval.lower || !interval.upper) return false;
  const comparison = compareVersions(interval.lower, interval.upper);
  return comparison > 0 || comparison === 0 && !(interval.lowerInclusive && interval.upperInclusive);
}
function parseHyphenRange(value) {
  const match = value.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
  if (!match) return null;
  const left = parsePartialVersion(match[1]);
  const right = parsePartialVersion(match[2]);
  if (!left || !right || left.major === null || right.major === null) return null;
  const lower = {
    major: left.major,
    minor: left.minor ?? 0,
    patch: left.patch ?? 0,
    prerelease: left.prerelease
  };
  let upper;
  let upperInclusive;
  if (right.minor === null) {
    upper = { major: right.major + 1, minor: 0, patch: 0 };
    upperInclusive = false;
  } else if (right.patch === null) {
    upper = { major: right.major, minor: right.minor + 1, patch: 0 };
    upperInclusive = false;
  } else {
    upper = {
      major: right.major,
      minor: right.minor,
      patch: right.patch,
      prerelease: right.prerelease
    };
    upperInclusive = true;
  }
  return { lower, lowerInclusive: true, upper, upperInclusive };
}
function parseRange(expression) {
  const source = expression.trim();
  if (!source) return null;
  const alternatives = source.split(/\s*\|\|\s*/);
  const intervals = [];
  for (const alternative of alternatives) {
    const hyphen = parseHyphenRange(alternative);
    if (hyphen) {
      intervals.push(hyphen);
      continue;
    }
    const tokens = alternative.replace(/,/g, " ").replace(/([<>]=?|[=~^])\s+(?=v?\d|[x*])/gi, "$1").trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    let current = unboundedInterval();
    for (const token of tokens) {
      const expanded = expandToken(token);
      if (!expanded) return null;
      const intersection = intersectIntervals(current, expanded);
      if (!intersection) {
        current = {
          lower: MIN_VERSION,
          lowerInclusive: false,
          upper: MIN_VERSION,
          upperInclusive: false
        };
        break;
      }
      current = intersection;
    }
    if (!intervalIsEmpty(current)) intervals.push(current);
  }
  return intervals.length > 0 ? { source, intervals: normalizeIntervals(intervals) } : null;
}
function normalizeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => {
    if (!a.lower) return b.lower ? -1 : 0;
    if (!b.lower) return 1;
    const comparison = compareVersions(a.lower, b.lower);
    if (comparison !== 0) return comparison;
    return Number(b.lowerInclusive) - Number(a.lowerInclusive);
  });
  const result = [];
  for (const interval of sorted) {
    const previous = result.at(-1);
    if (!previous || !intervalsTouchOrOverlap(previous, interval)) {
      result.push({ ...interval });
      continue;
    }
    const upper = laterUpper(previous, interval);
    previous.upper = upper.value;
    previous.upperInclusive = upper.inclusive;
  }
  return result;
}
function intervalsTouchOrOverlap(a, b) {
  if (!a.upper || !b.lower) return true;
  const comparison = compareVersions(a.upper, b.lower);
  return comparison > 0 || comparison === 0 && (a.upperInclusive || b.lowerInclusive);
}
function laterUpper(a, b) {
  if (!a.upper || !b.upper) return { value: null, inclusive: false };
  const comparison = compareVersions(a.upper, b.upper);
  if (comparison > 0) return { value: a.upper, inclusive: a.upperInclusive };
  if (comparison < 0) return { value: b.upper, inclusive: b.upperInclusive };
  return { value: a.upper, inclusive: a.upperInclusive || b.upperInclusive };
}
function intersectRangeSets(a, b) {
  const intersections = [];
  for (const left of a.intervals) {
    for (const right of b.intervals) {
      const intersection = intersectIntervals(left, right);
      if (intersection) intersections.push(intersection);
    }
  }
  return intersections.length > 0 ? { source: `${a.source} & ${b.source}`, intervals: normalizeIntervals(intersections) } : null;
}
function rangesIntersect(a, b) {
  return a.intervals.some(
    (left) => b.intervals.some((right) => intersectIntervals(left, right) !== null)
  );
}
function lowerStartsBeforeOrAt(cover, target) {
  if (!cover.lower) return true;
  if (!target.lower) return false;
  const comparison = compareVersions(cover.lower, target.lower);
  return comparison < 0 || comparison === 0 && (cover.lowerInclusive || !target.lowerInclusive);
}
function upperEndsAfterOrAt(cover, target) {
  if (!cover.upper) return true;
  if (!target.upper) return false;
  const comparison = compareVersions(cover.upper, target.upper);
  return comparison > 0 || comparison === 0 && (cover.upperInclusive || !target.upperInclusive);
}
function intervalCoveredBySet(target, covers) {
  return normalizeIntervals(covers).some(
    (cover) => lowerStartsBeforeOrAt(cover, target) && upperEndsAfterOrAt(cover, target)
  );
}
function isRangeSubset(candidate, allowed) {
  return candidate.intervals.every((interval) => intervalCoveredBySet(interval, allowed.intervals));
}

// src/analyzer.ts
function diagnosticCounts(diagnostics) {
  return {
    errors: diagnostics.filter((item) => item.severity === "error").length,
    warnings: diagnostics.filter((item) => item.severity === "warning").length,
    infos: diagnostics.filter((item) => item.severity === "info").length
  };
}
function analysisStatus(evidence, diagnostics) {
  if (evidence.length === 0) return "empty";
  if (diagnostics.some((item) => item.severity === "error")) return "incompatible";
  if (diagnostics.some((item) => item.severity === "warning")) return "warning";
  return "aligned";
}
function locationLabel(evidence) {
  return `${evidence.location.file}:${evidence.location.line}`;
}
function combinedSupport(support, diagnostics) {
  if (support.length === 0) return null;
  let combined = support[0].range;
  let previous = support[0].evidence;
  for (const item of support.slice(1)) {
    const intersection = intersectRangeSets(combined, item.range);
    if (!intersection) {
      diagnostics.push({
        code: "conflicting-support-ranges",
        severity: "error",
        message: `Support ranges ${previous.constraint} (${locationLabel(previous)}) and ${item.evidence.constraint} (${locationLabel(item.evidence)}) do not overlap.`,
        location: item.evidence.location,
        related: [previous.location],
        evidenceIds: [previous.id, item.evidence.id]
      });
      return null;
    }
    combined = intersection;
    previous = item.evidence;
  }
  return combined;
}
function unionRanges(items) {
  if (items.length === 0) return null;
  return {
    source: items.map((item) => item.evidence.constraint).join(" || "),
    intervals: items.flatMap((item) => item.range.intervals)
  };
}
function diagnoseRoleDrift(parsed, diagnostics) {
  const roles = ["development", "production", "test"];
  const grouped = /* @__PURE__ */ new Map();
  for (const role of roles) grouped.set(role, parsed.filter((item) => item.evidence.role === role));
  for (let leftIndex = 0; leftIndex < roles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < roles.length; rightIndex += 1) {
      const leftRole = roles[leftIndex];
      const rightRole = roles[rightIndex];
      const leftItems = grouped.get(leftRole) ?? [];
      const rightItems = grouped.get(rightRole) ?? [];
      const left = unionRanges(leftItems);
      const right = unionRanges(rightItems);
      if (!left || !right || rangesIntersect(left, right)) continue;
      const primary = rightItems[0].evidence;
      const related = leftItems[0].evidence;
      diagnostics.push({
        code: "role-drift",
        severity: "warning",
        message: `${rightRole} Node configuration (${right.source}) does not overlap ${leftRole} configuration (${left.source}). Add package.json engines.node to make the intended support policy explicit.`,
        location: primary.location,
        related: [related.location],
        evidenceIds: [...leftItems, ...rightItems].map((item) => item.evidence.id)
      });
    }
  }
}
function diagnoseConflictingSelectors(parsed, diagnostics) {
  const roles = ["development", "production"];
  for (const role of roles) {
    const items = parsed.filter((item) => item.evidence.role === role);
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex];
        const right = items[rightIndex];
        if (left.evidence.source === right.evidence.source && left.evidence.location.file === right.evidence.location.file) {
          continue;
        }
        if (rangesIntersect(left.range, right.range)) continue;
        diagnostics.push({
          code: "conflicting-role-selectors",
          severity: "warning",
          message: `${right.evidence.label} selects Node ${right.evidence.constraint}, which does not overlap ${left.evidence.label} (${left.evidence.constraint}) for the same ${role} role.`,
          location: right.evidence.location,
          related: [left.evidence.location],
          evidenceIds: [left.evidence.id, right.evidence.id]
        });
      }
    }
  }
}
function analyzeEvidence(evidence, options = {}) {
  const diagnostics = [...options.diagnostics ?? []];
  const parsed = [];
  for (const item of evidence) {
    const range = parseRange(item.constraint);
    if (!range) {
      diagnostics.push({
        code: "unrecognized-version",
        severity: "warning",
        message: `Could not interpret ${JSON.stringify(item.raw)} from ${item.label} as a Node semver range.`,
        location: item.location,
        evidenceIds: [item.id]
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
      location: evidence[0].location
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
          evidenceIds: [item.evidence.id, ...support.map((value) => value.evidence.id)]
        });
      } else if (!isRangeSubset(item.range, allowed)) {
        diagnostics.push({
          code: "partially-unsupported-runtime",
          severity: "warning",
          message: `${item.evidence.label} allows Node ${item.evidence.constraint}, which extends outside the supported range ${supportExpression}.`,
          location: item.evidence.location,
          related: supportLocations,
          evidenceIds: [item.evidence.id, ...support.map((value) => value.evidence.id)]
        });
      }
    }
  }
  diagnoseConflictingSelectors(parsed, diagnostics);
  if (evidence.length === 0 && diagnostics.length === 0) {
    diagnostics.push({
      code: "no-runtime-evidence",
      severity: "warning",
      message: "No Node.js runtime configuration was found."
    });
  }
  diagnostics.sort((a, b) => {
    const severity = { error: 0, warning: 1, info: 2 };
    const severityOrder = severity[a.severity] - severity[b.severity];
    if (severityOrder !== 0) return severityOrder;
    const fileOrder = (a.location?.file ?? "").localeCompare(b.location?.file ?? "");
    if (fileOrder !== 0) return fileOrder;
    return (a.location?.line ?? 0) - (b.location?.line ?? 0);
  });
  const roles = {};
  for (const item of evidence) roles[item.role] = (roles[item.role] ?? 0) + 1;
  const counts = diagnosticCounts(diagnostics);
  return {
    runtime: "node",
    root: options.root ?? process.cwd(),
    status: analysisStatus(evidence, diagnostics),
    evidence,
    diagnostics,
    summary: { sources: evidence.length, ...counts, roles }
  };
}

// src/scanner.ts
import { promises as fs } from "fs";
import path2 from "path";

// src/types.ts
var evidenceSequence = 0;
function createEvidence(value) {
  evidenceSequence += 1;
  return {
    ...value,
    id: value.id ?? `${value.source}:${value.location.file}:${value.location.line}:${value.location.column}:${evidenceSequence}`,
    runtime: "node"
  };
}

// src/parsers/json-ast.ts
var JsonParseError = class extends Error {
  constructor(message, offset) {
    super(message);
    this.offset = offset;
    this.name = "JsonParseError";
  }
  offset;
};
function parseJsonAst(text) {
  const parser = new Parser(text);
  const node = parser.parseValue();
  parser.skipWhitespace();
  if (!parser.atEnd()) parser.fail("Unexpected trailing content");
  return node;
}
function objectProperty(node, key) {
  if (node?.kind !== "object") return void 0;
  return node.properties?.find((property) => property.key === key);
}
function stringValue(node) {
  return node?.kind === "string" ? node.value : void 0;
}
var Parser = class {
  constructor(text) {
    this.text = text;
  }
  text;
  offset = 0;
  atEnd() {
    return this.offset >= this.text.length;
  }
  skipWhitespace() {
    while (!this.atEnd() && /\s/.test(this.text[this.offset])) this.offset += 1;
  }
  fail(message) {
    throw new JsonParseError(message, this.offset);
  }
  parseValue() {
    this.skipWhitespace();
    if (this.atEnd()) this.fail("Expected a JSON value");
    const character = this.text[this.offset];
    if (character === "{") return this.parseObject();
    if (character === "[") return this.parseArray();
    if (character === '"') return this.parseString();
    if (character === "t") return this.parseLiteral("true", "boolean", true);
    if (character === "f") return this.parseLiteral("false", "boolean", false);
    if (character === "n") return this.parseLiteral("null", "null", null);
    if (character === "-" || /\d/.test(character)) return this.parseNumber();
    return this.fail(`Unexpected character ${JSON.stringify(character)}`);
  }
  parseObject() {
    const start = this.offset;
    this.offset += 1;
    const properties = [];
    this.skipWhitespace();
    if (this.text[this.offset] === "}") {
      this.offset += 1;
      return { kind: "object", start, end: this.offset, properties };
    }
    while (!this.atEnd()) {
      this.skipWhitespace();
      if (this.text[this.offset] !== '"') this.fail("Expected a quoted object key");
      const keyNode = this.parseString();
      const key = keyNode.value;
      this.skipWhitespace();
      if (this.text[this.offset] !== ":") this.fail("Expected ':' after object key");
      this.offset += 1;
      const value = this.parseValue();
      properties.push({ key, keyStart: keyNode.start, keyEnd: keyNode.end, value });
      this.skipWhitespace();
      if (this.text[this.offset] === "}") {
        this.offset += 1;
        return { kind: "object", start, end: this.offset, properties };
      }
      if (this.text[this.offset] !== ",") this.fail("Expected ',' or '}' in object");
      this.offset += 1;
    }
    return this.fail("Unterminated object");
  }
  parseArray() {
    const start = this.offset;
    this.offset += 1;
    const items = [];
    this.skipWhitespace();
    if (this.text[this.offset] === "]") {
      this.offset += 1;
      return { kind: "array", start, end: this.offset, items };
    }
    while (!this.atEnd()) {
      items.push(this.parseValue());
      this.skipWhitespace();
      if (this.text[this.offset] === "]") {
        this.offset += 1;
        return { kind: "array", start, end: this.offset, items };
      }
      if (this.text[this.offset] !== ",") this.fail("Expected ',' or ']' in array");
      this.offset += 1;
    }
    return this.fail("Unterminated array");
  }
  parseString() {
    const start = this.offset;
    this.offset += 1;
    while (!this.atEnd()) {
      const character = this.text[this.offset];
      if (character === '"') {
        this.offset += 1;
        const raw = this.text.slice(start, this.offset);
        try {
          return { kind: "string", start, end: this.offset, value: JSON.parse(raw) };
        } catch {
          return this.fail("Invalid JSON string");
        }
      }
      if (character === "\\") {
        this.offset += 2;
      } else {
        if (character === "\n" || character === "\r") this.fail("Unterminated JSON string");
        this.offset += 1;
      }
    }
    return this.fail("Unterminated JSON string");
  }
  parseNumber() {
    const start = this.offset;
    const match = this.text.slice(this.offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) this.fail("Invalid JSON number");
    this.offset += match[0].length;
    return { kind: "number", start, end: this.offset, value: Number(match[0]) };
  }
  parseLiteral(literal, kind, value) {
    const start = this.offset;
    if (!this.text.startsWith(literal, this.offset)) this.fail(`Expected ${literal}`);
    this.offset += literal.length;
    return { kind, start, end: this.offset, value };
  }
};

// src/parsers/shared.ts
function offsetToLocation(text, file, offset) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastLineStart = 0;
  for (let index = 0; index < safeOffset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lastLineStart = index + 1;
    }
  }
  return { file, line, column: safeOffset - lastLineStart + 1 };
}
function lineLocation(file, line, column = 1) {
  return { file, line, column };
}
function stripMatchingQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
function stripInlineComment(value) {
  let single = false;
  let double = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" && !double) single = !single;
    if (character === '"' && !single && value[index - 1] !== "\\") double = !double;
    if (character === "#" && !single && !double) {
      if (index === 0 || /\s/.test(value[index - 1] ?? "")) return value.slice(0, index);
    }
  }
  return value;
}
function leadingWhitespace(value) {
  return value.match(/^\s*/)?.[0].length ?? 0;
}

// src/parsers/package-json.ts
function stringOffset(node) {
  return node.kind === "string" ? node.start + 1 : node.start;
}
function evidenceFromString(text, file, node, options) {
  const value = stringValue(node);
  if (value === void 0 || !value.trim()) return null;
  return createEvidence({
    ...options,
    location: offsetToLocation(text, file, stringOffset(node)),
    raw: value,
    constraint: value.trim()
  });
}
function parseDevRuntimeNode(text, file, node, index) {
  if (node.kind === "string") {
    return evidenceFromString(text, file, node, {
      role: "development",
      source: "package-dev-engines",
      label: "package.json devEngines.runtime",
      context: index === void 0 ? void 0 : `runtime entry ${index + 1}`
    });
  }
  if (node.kind !== "object") return null;
  const name = stringValue(objectProperty(node, "name")?.value);
  if (name && name.toLowerCase() !== "node") return null;
  const versionNode = objectProperty(node, "version")?.value;
  if (!versionNode) return null;
  return evidenceFromString(text, file, versionNode, {
    role: "development",
    source: "package-dev-engines",
    label: "package.json devEngines.runtime.version",
    context: index === void 0 ? void 0 : `runtime entry ${index + 1}`
  });
}
function parsePackageJson(text, file = "package.json") {
  const evidence = [];
  const diagnostics = [];
  let root;
  try {
    root = parseJsonAst(text);
  } catch (error) {
    const offset = error instanceof JsonParseError ? error.offset : 0;
    diagnostics.push({
      code: "invalid-package-json",
      severity: "warning",
      message: `Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`,
      location: offsetToLocation(text, file, offset)
    });
    return { evidence, diagnostics };
  }
  if (root.kind !== "object") {
    diagnostics.push({
      code: "invalid-package-json",
      severity: "warning",
      message: `${file} must contain a JSON object.`,
      location: offsetToLocation(text, file, root.start)
    });
    return { evidence, diagnostics };
  }
  const engines = objectProperty(root, "engines")?.value;
  const enginesNode = objectProperty(engines, "node")?.value;
  if (enginesNode) {
    const item = evidenceFromString(text, file, enginesNode, {
      role: "support",
      source: "package-engines",
      label: "package.json engines.node"
    });
    if (item) evidence.push(item);
  }
  const volta = objectProperty(root, "volta")?.value;
  const voltaNode = objectProperty(volta, "node")?.value;
  if (voltaNode) {
    const item = evidenceFromString(text, file, voltaNode, {
      role: "development",
      source: "package-volta",
      label: "package.json volta.node"
    });
    if (item) evidence.push(item);
  }
  const devEngines = objectProperty(root, "devEngines")?.value;
  const runtime = objectProperty(devEngines, "runtime")?.value;
  if (runtime?.kind === "array") {
    for (const [index, entry] of (runtime.items ?? []).entries()) {
      const item = parseDevRuntimeNode(text, file, entry, index);
      if (item) evidence.push(item);
    }
  } else if (runtime) {
    const item = parseDevRuntimeNode(text, file, runtime);
    if (item) evidence.push(item);
  }
  return { evidence, diagnostics };
}

// src/parsers/dockerfile.ts
function substituteArguments(value, argumentsMap) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, plain) => {
    const replacement = argumentsMap.get(braced ?? plain);
    return replacement?.value ?? match;
  });
}
function nodeTagFromImage(image) {
  const withoutDigest = image.split("@")[0];
  const lastSlash = withoutDigest.lastIndexOf("/");
  const imageName = withoutDigest.slice(lastSlash + 1);
  const colon = imageName.indexOf(":");
  const repository = colon === -1 ? imageName : imageName.slice(0, colon);
  if (repository.toLowerCase() !== "node") return null;
  return colon === -1 ? "latest" : imageName.slice(colon + 1);
}
function dockerTagToConstraint(tag) {
  const cleaned = stripMatchingQuotes(tag.trim());
  const numeric = cleaned.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (numeric) return [numeric[1], numeric[2], numeric[3]].filter(Boolean).join(".");
  const alias = cleaned.match(/^([A-Za-z][A-Za-z0-9]*)(?:-|$)/)?.[1];
  return alias?.toLowerCase() ?? cleaned;
}
function parseDockerfile(text, file = "Dockerfile") {
  const evidence = [];
  const diagnostics = [];
  const argumentsMap = /* @__PURE__ */ new Map();
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const argumentMatch = line.match(/^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*|=)([^\s#]+)?/i);
    if (argumentMatch?.[2]) {
      argumentsMap.set(argumentMatch[1], {
        value: stripMatchingQuotes(argumentMatch[2]),
        line: index + 1
      });
    }
    const fromMatch = line.match(/^\s*FROM\s+(?:--platform=(?:"[^"]+"|'[^']+'|\S+)\s+)?([^\s]+)(?:\s+AS\s+([A-Za-z0-9_.-]+))?/i);
    if (!fromMatch) continue;
    const rawImage = stripMatchingQuotes(fromMatch[1]);
    const resolvedImage = substituteArguments(rawImage, argumentsMap);
    const rawTag = nodeTagFromImage(resolvedImage);
    if (rawTag === null) continue;
    const constraint = dockerTagToConstraint(rawTag);
    const stage = fromMatch[2];
    const imageColumn = line.indexOf(fromMatch[1]) + 1;
    const colonOffset = fromMatch[1].lastIndexOf(":");
    const column = imageColumn + (colonOffset >= 0 ? colonOffset + 1 : 0);
    evidence.push(
      createEvidence({
        role: "production",
        source: "docker",
        location: lineLocation(file, index + 1, column),
        raw: rawTag,
        constraint,
        label: `${file} Node base image`,
        context: stage ? `stage ${stage}` : void 0
      })
    );
  }
  return { evidence, diagnostics };
}

// src/parsers/github-actions.ts
function cleanYamlScalar(value) {
  return stripMatchingQuotes(stripInlineComment(value).trim());
}
function splitInlineList(value, file, line, baseColumn) {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("[") && trimmed.endsWith("]"))) return [];
  const body = trimmed.slice(1, -1);
  const result = [];
  let segmentStart = 0;
  let quote = null;
  const pushSegment = (end) => {
    const segment = body.slice(segmentStart, end);
    const raw = cleanYamlScalar(segment);
    if (raw) {
      const offsetInSegment = segment.search(/\S/);
      result.push({
        value: raw,
        location: lineLocation(file, line, baseColumn + 1 + segmentStart + Math.max(0, offsetInSegment)),
        key: ""
      });
    }
  };
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if ((character === '"' || character === "'") && body[index - 1] !== "\\") {
      quote = quote === character ? null : quote ?? character;
    } else if (character === "," && !quote) {
      pushSegment(index);
      segmentStart = index + 1;
    }
  }
  pushSegment(body.length);
  return result;
}
function parseMatrices(lines, file) {
  const matrices = /* @__PURE__ */ new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[2];
    const inline = match[3];
    const indent = match[1].length;
    const inlineColumn = line.indexOf(inline, line.indexOf(":") + 1) + 1;
    if (inline.startsWith("[")) {
      const values2 = splitInlineList(inline, file, index + 1, inlineColumn);
      if (values2.length > 0) matrices.set(key, values2.map((item) => ({ ...item, key })));
      continue;
    }
    if (inline && !inline.startsWith("{") && !inline.startsWith("${{")) continue;
    if (inline) continue;
    const values = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (!candidate.trim() || candidate.trimStart().startsWith("#")) continue;
      const candidateIndent = leadingWhitespace(candidate);
      if (candidateIndent <= indent) break;
      const item = candidate.match(/^\s*-\s+(.+?)\s*$/);
      if (!item) break;
      const scalar = cleanYamlScalar(item[1]);
      if (!scalar || scalar.includes(":")) continue;
      const column = candidate.indexOf(item[1]) + 1;
      values.push({ value: scalar, location: lineLocation(file, cursor + 1, column), key });
    }
    if (values.length > 0) matrices.set(key, values);
  }
  for (const [index, line] of lines.entries()) {
    const object = line.match(/\bmatrix\s*:\s*\{\s*([A-Za-z0-9_-]+)\s*:\s*(\[[^\]]*\])/);
    if (!object) continue;
    const key = object[1];
    const list = object[2];
    const column = line.indexOf(list) + 1;
    const values = splitInlineList(list, file, index + 1, column).map((item) => ({ ...item, key }));
    if (values.length > 0) matrices.set(key, values);
  }
  return matrices;
}
function setupNodeInputs(lines, file) {
  const inputs = [];
  for (let index = 0; index < lines.length; index += 1) {
    const uses = lines[index].match(/^(\s*)(?:-\s*)?uses\s*:\s*['"]?actions\/setup-node@/i);
    if (!uses) continue;
    const usesIndent = uses[1].length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      const indent = leadingWhitespace(line);
      if (indent <= usesIndent && /^\s*(?:-|[A-Za-z])/.test(line)) break;
      const input = line.match(/^\s*node-version\s*:\s*(.*?)\s*$/i);
      if (!input) continue;
      const value = cleanYamlScalar(input[1]);
      const column = input[1] ? line.indexOf(input[1], line.indexOf(":") + 1) + 1 : line.length + 1;
      inputs.push({ value, location: lineLocation(file, cursor + 1, column), lineIndex: cursor });
      break;
    }
  }
  return inputs;
}
function referencedMatrixKey(expression) {
  const match = expression.match(/\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/);
  return match?.[1] ?? null;
}
function parseGitHubActions(text, file) {
  const evidence = [];
  const diagnostics = [];
  const lines = text.split(/\r?\n/);
  const matrices = parseMatrices(lines, file);
  const inputs = setupNodeInputs(lines, file);
  for (const input of inputs) {
    const matrixKey = referencedMatrixKey(input.value);
    if (matrixKey) {
      const values = matrices.get(matrixKey);
      if (!values || values.length === 0) {
        diagnostics.push({
          code: "unresolved-actions-matrix",
          severity: "warning",
          message: `Could not resolve GitHub Actions matrix.${matrixKey} used by setup-node.`,
          location: input.location
        });
        continue;
      }
      for (const value of values) {
        evidence.push(
          createEvidence({
            role: "test",
            source: "github-actions",
            location: value.location,
            raw: value.value,
            constraint: value.value,
            label: "GitHub Actions setup-node matrix",
            context: `matrix.${matrixKey}`
          })
        );
      }
      continue;
    }
    if (input.value === "|" || input.value === ">") {
      for (let cursor = input.lineIndex + 1; cursor < lines.length; cursor += 1) {
        const line = lines[cursor];
        if (!line.trim()) continue;
        if (leadingWhitespace(line) <= input.location.column - 1) break;
        for (const token of cleanYamlScalar(line).split(/\s+/).filter(Boolean)) {
          evidence.push(
            createEvidence({
              role: "test",
              source: "github-actions",
              location: lineLocation(file, cursor + 1, line.indexOf(token) + 1),
              raw: token,
              constraint: token,
              label: "GitHub Actions setup-node"
            })
          );
        }
      }
      continue;
    }
    if (input.value) {
      evidence.push(
        createEvidence({
          role: "test",
          source: "github-actions",
          location: input.location,
          raw: input.value,
          constraint: input.value,
          label: "GitHub Actions setup-node"
        })
      );
    }
  }
  return { evidence, diagnostics };
}

// src/parsers/version-files.ts
function parseVersionFile(text, file, options) {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const uncommented = stripInlineComment(line);
    const raw = uncommented.trim();
    if (!raw) continue;
    const column = line.indexOf(raw) + 1;
    return {
      evidence: [
        createEvidence({
          role: "development",
          source: options.source,
          location: lineLocation(file, index + 1, column),
          raw,
          constraint: raw,
          label: options.label
        })
      ],
      diagnostics: []
    };
  }
  return { evidence: [], diagnostics: [] };
}
function parseNvmrc(text, file = ".nvmrc") {
  return parseVersionFile(text, file, { source: "nvmrc", label: ".nvmrc" });
}
function parseNodeVersion(text, file = ".node-version") {
  return parseVersionFile(text, file, {
    source: "node-version",
    label: ".node-version"
  });
}
function parseToolVersions(text, file = ".tool-versions") {
  const evidence = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const uncommented = stripInlineComment(line);
    const match = uncommented.match(/^\s*(nodejs|node)\s+(.+?)\s*$/i);
    if (!match) continue;
    const versionsText = match[2];
    const valueStart = uncommented.indexOf(versionsText);
    const matches = versionsText.matchAll(/\S+/g);
    for (const matchVersion of matches) {
      const raw = matchVersion[0];
      const relative = matchVersion.index ?? 0;
      evidence.push(
        createEvidence({
          role: "development",
          source: "tool-versions",
          location: lineLocation(file, index + 1, valueStart + relative + 1),
          raw,
          constraint: raw,
          label: ".tool-versions nodejs",
          context: evidence.length > 0 ? `installed version ${evidence.length + 1}` : void 0
        })
      );
    }
  }
  return { evidence, diagnostics: [] };
}

// src/scanner.ts
function slash(value) {
  return value.split(path2.sep).join("/");
}
function isDockerfile(fileName) {
  return /^Dockerfile(?:\..+)?$/i.test(fileName) || /\.Dockerfile$/i.test(fileName);
}
function isWorkflow(relativePath) {
  return /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i.test(relativePath);
}
function isCandidate(relativePath) {
  const fileName = path2.posix.basename(relativePath);
  return fileName === "package.json" || fileName === ".nvmrc" || fileName === ".node-version" || fileName === ".tool-versions" || isDockerfile(fileName) || isWorkflow(relativePath);
}
async function discoverFiles(root) {
  const found = [];
  const rootEntries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    const relative = slash(entry.name);
    if (isCandidate(relative) && !isWorkflow(relative)) found.push(relative);
  }
  const workflowsDirectory = path2.join(root, ".github", "workflows");
  try {
    const workflows = await fs.readdir(workflowsDirectory, { withFileTypes: true });
    for (const entry of workflows) {
      if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
      found.push(`.github/workflows/${entry.name}`);
    }
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") throw error;
  }
  return found.sort((a, b) => a.localeCompare(b));
}
function parseFile(text, relativePath) {
  const fileName = path2.posix.basename(relativePath);
  if (fileName === "package.json") return parsePackageJson(text, relativePath);
  if (fileName === ".nvmrc") return parseNvmrc(text, relativePath);
  if (fileName === ".node-version") return parseNodeVersion(text, relativePath);
  if (fileName === ".tool-versions") return parseToolVersions(text, relativePath);
  if (isDockerfile(fileName)) return parseDockerfile(text, relativePath);
  if (isWorkflow(relativePath)) return parseGitHubActions(text, relativePath);
  return { evidence: [], diagnostics: [] };
}
async function scanProject(options = {}) {
  const root = path2.resolve(options.cwd ?? process.cwd());
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error(`${root} is not a directory.`);
  const files = await discoverFiles(root);
  const evidence = [];
  const diagnostics = [];
  for (const relativePath of files) {
    const absolutePath = path2.join(root, ...relativePath.split("/"));
    try {
      const text = await fs.readFile(absolutePath, "utf8");
      const parsed = parseFile(text, relativePath);
      evidence.push(...parsed.evidence);
      diagnostics.push(...parsed.diagnostics);
    } catch (error) {
      diagnostics.push({
        code: "file-read-error",
        severity: "warning",
        message: `Could not read ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        location: { file: relativePath, line: 1, column: 1 }
      });
    }
  }
  evidence.sort((a, b) => {
    const pathOrder = a.location.file.localeCompare(b.location.file);
    if (pathOrder !== 0) return pathOrder;
    if (a.location.line !== b.location.line) return a.location.line - b.location.line;
    return a.location.column - b.location.column;
  });
  return { root, files, evidence, diagnostics };
}

// src/inspect.ts
async function inspectProject(options = {}) {
  const scanned = await scanProject(options);
  return analyzeEvidence(scanned.evidence, {
    root: scanned.root,
    diagnostics: scanned.diagnostics
  });
}

// src/cli.ts
var VERSION = "0.1.0";
var HELP = `RuntimeTruth \u2014 find Node.js version drift before CI does

Usage:
  runtimetruth check [path] [options]
  runtimetruth [path] [options]

Options:
  --format <pretty|json|github>   Output format (default: pretty)
  --fail-on <error|warning|never> Exit threshold (default: error)
  --json                          Shortcut for --format json
  --no-color                      Disable ANSI colors
  -h, --help                      Show help
  -v, --version                   Show version
`;
function takeValue(argv, index, name) {
  const argument = argv[index];
  if (argument === void 0) throw new Error(`${name} requires a value.`);
  const equals = argument.indexOf("=");
  if (equals >= 0) return [argument.slice(equals + 1), index];
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${name} requires a value.`);
  return [value, index + 1];
}
function parseCliArgs(argv, environment = {}) {
  let command = "check";
  let cwd = environment.cwd ?? process.cwd();
  let format = "pretty";
  let failOn = "error";
  let color = environment.color ?? Boolean(process.stdout.isTTY);
  let pathSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "check" && index === 0) continue;
    if (argument === "-h" || argument === "--help") {
      command = "help";
      continue;
    }
    if (argument === "-v" || argument === "--version") {
      command = "version";
      continue;
    }
    if (argument === "--json") {
      format = "json";
      continue;
    }
    if (argument === "--no-color") {
      color = false;
      continue;
    }
    if (argument === "--color") {
      color = true;
      continue;
    }
    if (argument === "--format" || argument.startsWith("--format=")) {
      const [value, consumed] = takeValue(argv, index, "--format");
      index = consumed;
      if (!["pretty", "json", "github"].includes(value)) {
        throw new Error(`Unknown output format ${JSON.stringify(value)}.`);
      }
      format = value;
      continue;
    }
    if (argument === "--fail-on" || argument.startsWith("--fail-on=")) {
      const [value, consumed] = takeValue(argv, index, "--fail-on");
      index = consumed;
      if (!["error", "warning", "never"].includes(value)) {
        throw new Error(`Unknown --fail-on value ${JSON.stringify(value)}.`);
      }
      failOn = value;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option ${argument}.`);
    if (pathSeen) throw new Error(`Unexpected positional argument ${JSON.stringify(argument)}.`);
    cwd = path3.resolve(environment.cwd ?? process.cwd(), argument);
    pathSeen = true;
  }
  if (format !== "pretty") color = false;
  return { command, cwd, format, failOn, color };
}
async function runCli(argv = process.argv.slice(2), io = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value)
}) {
  let options;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    io.stderr(`RuntimeTruth: ${error instanceof Error ? error.message : String(error)}

${HELP}`);
    return 2;
  }
  if (options.command === "help") {
    io.stdout(HELP);
    return 0;
  }
  if (options.command === "version") {
    io.stdout(`${VERSION}
`);
    return 0;
  }
  try {
    const result = await inspectProject({ cwd: options.cwd });
    if (options.format === "json") io.stdout(formatJson(result));
    else if (options.format === "github") io.stdout(formatGithub(result));
    else io.stdout(formatPretty(result, { color: options.color, cwd: process.cwd() }));
    return shouldFail(result, options.failOn) ? 1 : 0;
  } catch (error) {
    io.stderr(`RuntimeTruth: ${error instanceof Error ? error.message : String(error)}
`);
    return 2;
  }
}
function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}
if (isDirectInvocation()) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
export {
  VERSION,
  parseCliArgs,
  runCli
};
//# sourceMappingURL=cli.js.map