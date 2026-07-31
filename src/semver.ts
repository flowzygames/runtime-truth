export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export interface Interval {
  lower: Version | null;
  lowerInclusive: boolean;
  upper: Version | null;
  upperInclusive: boolean;
}

export interface RangeSet {
  source: string;
  intervals: Interval[];
}

export type RangeRelationship = "subset" | "overlap" | "disjoint" | "unknown";

interface PartialVersion {
  major: number | null;
  minor: number | null;
  patch: number | null;
  prerelease?: string;
}

const MIN_VERSION: Version = { major: 0, minor: 0, patch: 0 };

export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const av = left[index];
    const bv = right[index];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
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

export function formatVersion(version: Version): string {
  return `${version.major}.${version.minor}.${version.patch}${
    version.prerelease ? `-${version.prerelease}` : ""
  }`;
}

export function parseVersion(value: string): Version | null {
  const partial = parsePartialVersion(value);
  if (
    !partial ||
    partial.major === null ||
    partial.minor === null ||
    partial.patch === null
  ) {
    return null;
  }
  return {
    major: partial.major,
    minor: partial.minor,
    patch: partial.patch,
    prerelease: partial.prerelease,
  };
}

function parsePartialVersion(value: string): PartialVersion | null {
  const cleaned = value.trim().replace(/^v(?=\d)/i, "");
  const match = cleaned.match(
    /^(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i,
  );
  if (!match) return null;
  const part = (input: string | undefined): number | null =>
    input === undefined || /^(?:x|\*)$/i.test(input) ? null : Number(input);
  const major = part(match[1]);
  const minor = part(match[2]);
  const patch = part(match[3]);
  if (major === null && (minor !== null || patch !== null)) return null;
  if (minor === null && patch !== null) return null;
  return { major, minor, patch, prerelease: match[4] };
}

function exactInterval(version: Version): Interval {
  return {
    lower: version,
    lowerInclusive: true,
    upper: version,
    upperInclusive: true,
  };
}

function partialInterval(partial: PartialVersion): Interval {
  if (partial.major === null) return unboundedInterval();
  if (partial.minor === null) {
    return {
      lower: { major: partial.major, minor: 0, patch: 0 },
      lowerInclusive: true,
      upper: { major: partial.major + 1, minor: 0, patch: 0 },
      upperInclusive: false,
    };
  }
  if (partial.patch === null) {
    return {
      lower: { major: partial.major, minor: partial.minor, patch: 0 },
      lowerInclusive: true,
      upper: { major: partial.major, minor: partial.minor + 1, patch: 0 },
      upperInclusive: false,
    };
  }
  return exactInterval({
    major: partial.major,
    minor: partial.minor,
    patch: partial.patch,
    prerelease: partial.prerelease,
  });
}

function unboundedInterval(): Interval {
  return { lower: null, lowerInclusive: false, upper: null, upperInclusive: false };
}

function nextPartialUpper(partial: PartialVersion, operator: "caret" | "tilde"): Version {
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

function expandToken(token: string): Interval | null {
  const trimmed = token.trim();
  if (!trimmed || trimmed === "*" || /^x$/i.test(trimmed)) return unboundedInterval();

  const comparator = trimmed.match(/^(<=|>=|<|>|=|~\s*|\^\s*)?(.*)$/);
  if (!comparator) return null;
  const operator = (comparator[1] ?? "").replace(/\s/g, "");
  const partial = parsePartialVersion(comparator[2]!);
  if (!partial || partial.major === null) {
    return operator === "" && partial ? unboundedInterval() : null;
  }

  const base: Version = {
    major: partial.major,
    minor: partial.minor ?? 0,
    patch: partial.patch ?? 0,
    prerelease: partial.prerelease,
  };

  if (operator === "^" || operator === "~") {
    return {
      lower: base,
      lowerInclusive: true,
      upper: nextPartialUpper(partial, operator === "^" ? "caret" : "tilde"),
      upperInclusive: false,
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
        upperInclusive: false,
      };
    }
    if (partial.patch === null) {
      return {
        lower: { major: partial.major, minor: partial.minor + 1, patch: 0 },
        lowerInclusive: true,
        upper: null,
        upperInclusive: false,
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
        upperInclusive: false,
      };
    }
    if (partial.patch === null) {
      return {
        lower: null,
        lowerInclusive: false,
        upper: { major: partial.major, minor: partial.minor + 1, patch: 0 },
        upperInclusive: false,
      };
    }
    return { lower: null, lowerInclusive: false, upper: base, upperInclusive: true };
  }
  return null;
}

function intersectIntervals(a: Interval, b: Interval): Interval | null {
  const lower = laterLower(a, b);
  const upper = earlierUpper(a, b);
  const result: Interval = {
    lower: lower.value,
    lowerInclusive: lower.inclusive,
    upper: upper.value,
    upperInclusive: upper.inclusive,
  };
  return intervalIsEmpty(result) ? null : result;
}

function laterLower(a: Interval, b: Interval): { value: Version | null; inclusive: boolean } {
  if (!a.lower) return { value: b.lower, inclusive: b.lowerInclusive };
  if (!b.lower) return { value: a.lower, inclusive: a.lowerInclusive };
  const comparison = compareVersions(a.lower, b.lower);
  if (comparison > 0) return { value: a.lower, inclusive: a.lowerInclusive };
  if (comparison < 0) return { value: b.lower, inclusive: b.lowerInclusive };
  return { value: a.lower, inclusive: a.lowerInclusive && b.lowerInclusive };
}

function earlierUpper(a: Interval, b: Interval): { value: Version | null; inclusive: boolean } {
  if (!a.upper) return { value: b.upper, inclusive: b.upperInclusive };
  if (!b.upper) return { value: a.upper, inclusive: a.upperInclusive };
  const comparison = compareVersions(a.upper, b.upper);
  if (comparison < 0) return { value: a.upper, inclusive: a.upperInclusive };
  if (comparison > 0) return { value: b.upper, inclusive: b.upperInclusive };
  return { value: a.upper, inclusive: a.upperInclusive && b.upperInclusive };
}

function intervalIsEmpty(interval: Interval): boolean {
  if (!interval.lower || !interval.upper) return false;
  const comparison = compareVersions(interval.lower, interval.upper);
  return comparison > 0 ||
    (comparison === 0 && !(interval.lowerInclusive && interval.upperInclusive));
}

function parseHyphenRange(value: string): Interval | null {
  const match = value.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
  if (!match) return null;
  const left = parsePartialVersion(match[1]!);
  const right = parsePartialVersion(match[2]!);
  if (!left || !right || left.major === null || right.major === null) return null;
  const lower: Version = {
    major: left.major,
    minor: left.minor ?? 0,
    patch: left.patch ?? 0,
    prerelease: left.prerelease,
  };
  let upper: Version;
  let upperInclusive: boolean;
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
      prerelease: right.prerelease,
    };
    upperInclusive = true;
  }
  return { lower, lowerInclusive: true, upper, upperInclusive };
}

export function parseRange(expression: string): RangeSet | null {
  const source = expression.trim();
  if (!source) return null;
  const alternatives = source.split(/\s*\|\|\s*/);
  const intervals: Interval[] = [];

  for (const alternative of alternatives) {
    const hyphen = parseHyphenRange(alternative);
    if (hyphen) {
      intervals.push(hyphen);
      continue;
    }
    const tokens = alternative
      .replace(/,/g, " ")
      .replace(/([<>]=?|[=~^])\s+(?=v?\d|[x*])/gi, "$1")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
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
          upperInclusive: false,
        };
        break;
      }
      current = intersection;
    }
    if (!intervalIsEmpty(current)) intervals.push(current);
  }

  return intervals.length > 0 ? { source, intervals: normalizeIntervals(intervals) } : null;
}

function normalizeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => {
    if (!a.lower) return b.lower ? -1 : 0;
    if (!b.lower) return 1;
    const comparison = compareVersions(a.lower, b.lower);
    if (comparison !== 0) return comparison;
    return Number(b.lowerInclusive) - Number(a.lowerInclusive);
  });
  const result: Interval[] = [];
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

function intervalsTouchOrOverlap(a: Interval, b: Interval): boolean {
  if (!a.upper || !b.lower) return true;
  const comparison = compareVersions(a.upper, b.lower);
  return comparison > 0 || (comparison === 0 && (a.upperInclusive || b.lowerInclusive));
}

function laterUpper(a: Interval, b: Interval): { value: Version | null; inclusive: boolean } {
  if (!a.upper || !b.upper) return { value: null, inclusive: false };
  const comparison = compareVersions(a.upper, b.upper);
  if (comparison > 0) return { value: a.upper, inclusive: a.upperInclusive };
  if (comparison < 0) return { value: b.upper, inclusive: b.upperInclusive };
  return { value: a.upper, inclusive: a.upperInclusive || b.upperInclusive };
}

export function intersectRangeSets(a: RangeSet, b: RangeSet): RangeSet | null {
  const intersections: Interval[] = [];
  for (const left of a.intervals) {
    for (const right of b.intervals) {
      const intersection = intersectIntervals(left, right);
      if (intersection) intersections.push(intersection);
    }
  }
  return intersections.length > 0
    ? { source: `${a.source} & ${b.source}`, intervals: normalizeIntervals(intersections) }
    : null;
}

export function rangesIntersect(a: RangeSet, b: RangeSet): boolean {
  return a.intervals.some((left) =>
    b.intervals.some((right) => intersectIntervals(left, right) !== null),
  );
}

function lowerStartsBeforeOrAt(cover: Interval, target: Interval): boolean {
  if (!cover.lower) return true;
  if (!target.lower) return false;
  const comparison = compareVersions(cover.lower, target.lower);
  return comparison < 0 ||
    (comparison === 0 && (cover.lowerInclusive || !target.lowerInclusive));
}

function upperEndsAfterOrAt(cover: Interval, target: Interval): boolean {
  if (!cover.upper) return true;
  if (!target.upper) return false;
  const comparison = compareVersions(cover.upper, target.upper);
  return comparison > 0 ||
    (comparison === 0 && (cover.upperInclusive || !target.upperInclusive));
}

function intervalCoveredBySet(target: Interval, covers: Interval[]): boolean {
  // normalizeIntervals merges touching coverage, so one interval must contain the target.
  return normalizeIntervals(covers).some(
    (cover) => lowerStartsBeforeOrAt(cover, target) && upperEndsAfterOrAt(cover, target),
  );
}

export function isRangeSubset(candidate: RangeSet, allowed: RangeSet): boolean {
  return candidate.intervals.every((interval) => intervalCoveredBySet(interval, allowed.intervals));
}

export function relateRanges(
  candidateExpression: string,
  allowedExpression: string,
): RangeRelationship {
  const candidate = parseRange(candidateExpression);
  const allowed = parseRange(allowedExpression);
  if (!candidate || !allowed) return "unknown";
  if (!rangesIntersect(candidate, allowed)) return "disjoint";
  return isRangeSubset(candidate, allowed) ? "subset" : "overlap";
}

export function satisfies(version: string | Version, expression: string): boolean {
  const parsedVersion = typeof version === "string" ? parseVersion(version) : version;
  const range = parseRange(expression);
  if (!parsedVersion || !range) return false;
  const exact = exactInterval(parsedVersion);
  return range.intervals.some((interval) => intersectIntervals(exact, interval) !== null);
}
