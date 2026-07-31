export type RuntimeName = "node";

export type RuntimeRole = "support" | "development" | "production" | "test";

export type SourceKind =
  | "package-engines"
  | "package-dev-engines"
  | "package-volta"
  | "nvmrc"
  | "node-version"
  | "tool-versions"
  | "docker"
  | "github-actions";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface SourceLocation {
  /** Repository-relative, slash-separated path. */
  file: string;
  /** One-based line number. */
  line: number;
  /** One-based column number. */
  column: number;
}

export interface RuntimeEvidence {
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

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  location?: SourceLocation;
  related?: SourceLocation[];
  evidenceIds?: string[];
}

export interface ParseOutput {
  evidence: RuntimeEvidence[];
  diagnostics: Diagnostic[];
}

export interface ScanOptions {
  cwd?: string;
}

export interface ScanResult extends ParseOutput {
  root: string;
  files: string[];
}

export type AnalysisStatus = "aligned" | "warning" | "incompatible" | "empty";

export interface AnalysisSummary {
  sources: number;
  errors: number;
  warnings: number;
  infos: number;
  roles: Partial<Record<RuntimeRole, number>>;
}

export interface AnalysisResult {
  runtime: RuntimeName;
  root: string;
  status: AnalysisStatus;
  evidence: RuntimeEvidence[];
  diagnostics: Diagnostic[];
  summary: AnalysisSummary;
}

export interface InspectOptions extends ScanOptions {}

export type OutputFormat = "pretty" | "json" | "github";

export type FailOn = "error" | "warning" | "never";

export interface PrettyFormatOptions {
  color?: boolean;
  cwd?: string;
}

let evidenceSequence = 0;

export function createEvidence(
  value: Omit<RuntimeEvidence, "id" | "runtime"> & { id?: string },
): RuntimeEvidence {
  evidenceSequence += 1;
  return {
    ...value,
    id:
      value.id ??
      `${value.source}:${value.location.file}:${value.location.line}:${value.location.column}:${evidenceSequence}`,
    runtime: "node",
  };
}

export function emptyParseOutput(): ParseOutput {
  return { evidence: [], diagnostics: [] };
}
