import { R as RuntimeEvidence, D as Diagnostic, A as AnalysisResult, I as InspectOptions, S as ScanOptions, a as ScanResult, P as PrettyFormatOptions, F as FailOn, b as ParseOutput, c as SourceKind } from './types-BcSf6TtJ.js';
export { d as AnalysisStatus, e as AnalysisSummary, f as DiagnosticSeverity, O as OutputFormat, g as RuntimeName, h as RuntimeRole, i as SourceLocation, j as createEvidence, k as emptyParseOutput } from './types-BcSf6TtJ.js';

declare function analyzeEvidence(evidence: RuntimeEvidence[], options?: {
    root?: string;
    diagnostics?: Diagnostic[];
}): AnalysisResult;

declare function inspectProject(options?: InspectOptions): Promise<AnalysisResult>;

declare function scanProject(options?: ScanOptions): Promise<ScanResult>;

declare function formatPretty(result: AnalysisResult, options?: PrettyFormatOptions): string;
declare function formatJson(result: AnalysisResult): string;
declare function formatGithub(result: AnalysisResult): string;
declare function shouldFail(result: AnalysisResult, failOn?: FailOn): boolean;

interface Version {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
}
interface Interval {
    lower: Version | null;
    lowerInclusive: boolean;
    upper: Version | null;
    upperInclusive: boolean;
}
interface RangeSet {
    source: string;
    intervals: Interval[];
}
type RangeRelationship = "subset" | "overlap" | "disjoint" | "unknown";
declare function compareVersions(a: Version, b: Version): number;
declare function formatVersion(version: Version): string;
declare function parseVersion(value: string): Version | null;
declare function parseRange(expression: string): RangeSet | null;
declare function intersectRangeSets(a: RangeSet, b: RangeSet): RangeSet | null;
declare function rangesIntersect(a: RangeSet, b: RangeSet): boolean;
declare function isRangeSubset(candidate: RangeSet, allowed: RangeSet): boolean;
declare function relateRanges(candidateExpression: string, allowedExpression: string): RangeRelationship;
declare function satisfies(version: string | Version, expression: string): boolean;

declare function parsePackageJson(text: string, file?: string): ParseOutput;

/** Convert official Node image tags (20-alpine, 20.11.1-bookworm) to semver inputs. */
declare function dockerTagToConstraint(tag: string): string;
declare function parseDockerfile(text: string, file?: string): ParseOutput;

declare function parseGitHubActions(text: string, file: string): ParseOutput;

interface VersionFileOptions {
    source: Extract<SourceKind, "nvmrc" | "node-version">;
    label: string;
}
declare function parseVersionFile(text: string, file: string, options: VersionFileOptions): ParseOutput;
declare function parseNvmrc(text: string, file?: string): ParseOutput;
declare function parseNodeVersion(text: string, file?: string): ParseOutput;
declare function parseToolVersions(text: string, file?: string): ParseOutput;

export { AnalysisResult, Diagnostic, FailOn, InspectOptions, ParseOutput, PrettyFormatOptions, RuntimeEvidence, ScanOptions, ScanResult, SourceKind, analyzeEvidence, compareVersions, dockerTagToConstraint, formatGithub, formatJson, formatPretty, formatVersion, inspectProject, intersectRangeSets, isRangeSubset, parseDockerfile, parseGitHubActions, parseNodeVersion, parseNvmrc, parsePackageJson, parseRange, parseToolVersions, parseVersion, parseVersionFile, rangesIntersect, relateRanges, satisfies, scanProject, shouldFail };
