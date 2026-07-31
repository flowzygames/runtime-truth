import { analyzeEvidence } from "./analyzer.js";
import { scanProject } from "./scanner.js";
import type { AnalysisResult, InspectOptions } from "./types.js";

export async function inspectProject(options: InspectOptions = {}): Promise<AnalysisResult> {
  const scanned = await scanProject(options);
  return analyzeEvidence(scanned.evidence, {
    root: scanned.root,
    diagnostics: scanned.diagnostics,
  });
}
