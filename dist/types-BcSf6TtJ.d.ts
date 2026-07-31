type RuntimeName = "node";
type RuntimeRole = "support" | "development" | "production" | "test";
type SourceKind = "package-engines" | "package-dev-engines" | "package-volta" | "nvmrc" | "node-version" | "tool-versions" | "docker" | "github-actions";
type DiagnosticSeverity = "error" | "warning" | "info";
interface SourceLocation {
    /** Repository-relative, slash-separated path. */
    file: string;
    /** One-based line number. */
    line: number;
    /** One-based column number. */
    column: number;
}
interface RuntimeEvidence {
    id: string;
    runtime: RuntimeName;
    role: RuntimeRole;
    source: SourceKind;
    location: SourceLocation;
    /** The value as it appeared in the source (without surrounding JSON/YAML quotes). */
    raw: string;
    /** A semver expression suitable for compatibility analysis. */
    constraint: string;
    /** A short human-readable description of the setting. */
    label: string;
    /** Optional detail such as a Docker stage or Actions matrix key. */
    context?: string;
}
interface Diagnostic {
    code: string;
    severity: DiagnosticSeverity;
    message: string;
    location?: SourceLocation;
    related?: SourceLocation[];
    evidenceIds?: string[];
}
interface ParseOutput {
    evidence: RuntimeEvidence[];
    diagnostics: Diagnostic[];
}
interface ScanOptions {
    cwd?: string;
}
interface ScanResult extends ParseOutput {
    root: string;
    files: string[];
}
type AnalysisStatus = "aligned" | "warning" | "incompatible" | "empty";
interface AnalysisSummary {
    sources: number;
    errors: number;
    warnings: number;
    infos: number;
    roles: Partial<Record<RuntimeRole, number>>;
}
interface AnalysisResult {
    runtime: RuntimeName;
    root: string;
    status: AnalysisStatus;
    evidence: RuntimeEvidence[];
    diagnostics: Diagnostic[];
    summary: AnalysisSummary;
}
interface InspectOptions extends ScanOptions {
}
type OutputFormat = "pretty" | "json" | "github";
type FailOn = "error" | "warning" | "never";
interface PrettyFormatOptions {
    color?: boolean;
    cwd?: string;
}
declare function createEvidence(value: Omit<RuntimeEvidence, "id" | "runtime"> & {
    id?: string;
}): RuntimeEvidence;
declare function emptyParseOutput(): ParseOutput;

export { type AnalysisResult as A, type Diagnostic as D, type FailOn as F, type InspectOptions as I, type OutputFormat as O, type PrettyFormatOptions as P, type RuntimeEvidence as R, type ScanOptions as S, type ScanResult as a, type ParseOutput as b, type SourceKind as c, type AnalysisStatus as d, type AnalysisSummary as e, type DiagnosticSeverity as f, type RuntimeName as g, type RuntimeRole as h, type SourceLocation as i, createEvidence as j, emptyParseOutput as k };
