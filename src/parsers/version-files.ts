import { createEvidence, type ParseOutput, type SourceKind } from "../types.js";
import { lineLocation, stripInlineComment } from "./shared.js";

interface VersionFileOptions {
  source: Extract<SourceKind, "nvmrc" | "node-version">;
  label: string;
}

export function parseVersionFile(
  text: string,
  file: string,
  options: VersionFileOptions,
): ParseOutput {
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
          label: options.label,
        }),
      ],
      diagnostics: [],
    };
  }
  return { evidence: [], diagnostics: [] };
}

export function parseNvmrc(text: string, file = ".nvmrc"): ParseOutput {
  return parseVersionFile(text, file, { source: "nvmrc", label: ".nvmrc" });
}

export function parseNodeVersion(text: string, file = ".node-version"): ParseOutput {
  return parseVersionFile(text, file, {
    source: "node-version",
    label: ".node-version",
  });
}

export function parseToolVersions(text: string, file = ".tool-versions"): ParseOutput {
  const evidence: ParseOutput["evidence"] = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const uncommented = stripInlineComment(line);
    const match = uncommented.match(/^\s*(nodejs|node)\s+(.+?)\s*$/i);
    if (!match) continue;
    const versionsText = match[2]!;
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
          context: evidence.length > 0 ? `installed version ${evidence.length + 1}` : undefined,
        }),
      );
    }
  }
  return { evidence, diagnostics: [] };
}
