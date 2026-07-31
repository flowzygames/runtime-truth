import { promises as fs } from "node:fs";
import path from "node:path";

import type { ParseOutput, ScanOptions, ScanResult } from "./types.js";
import {
  parseDockerfile,
  parseGitHubActions,
  parseNodeVersion,
  parseNvmrc,
  parsePackageJson,
  parseToolVersions,
} from "./parsers/index.js";

function slash(value: string): string {
  return value.split(path.sep).join("/");
}

function isDockerfile(fileName: string): boolean {
  return /^Dockerfile(?:\..+)?$/i.test(fileName) || /\.Dockerfile$/i.test(fileName);
}

function isWorkflow(relativePath: string): boolean {
  return /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i.test(relativePath);
}

function isCandidate(relativePath: string): boolean {
  const fileName = path.posix.basename(relativePath);
  return (
    fileName === "package.json" ||
    fileName === ".nvmrc" ||
    fileName === ".node-version" ||
    fileName === ".tool-versions" ||
    isDockerfile(fileName) ||
    isWorkflow(relativePath)
  );
}

async function discoverFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const rootEntries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    const relative = slash(entry.name);
    if (isCandidate(relative) && !isWorkflow(relative)) found.push(relative);
  }

  // RuntimeTruth deliberately treats cwd as one independently versioned package.
  // Workflows are the sole nested source scanned by default.
  const workflowsDirectory = path.join(root, ".github", "workflows");
  try {
    const workflows = await fs.readdir(workflowsDirectory, { withFileTypes: true });
    for (const entry of workflows) {
      if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
      found.push(`.github/workflows/${entry.name}`);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  return found.sort((a, b) => a.localeCompare(b));
}

function parseFile(text: string, relativePath: string): ParseOutput {
  const fileName = path.posix.basename(relativePath);
  if (fileName === "package.json") return parsePackageJson(text, relativePath);
  if (fileName === ".nvmrc") return parseNvmrc(text, relativePath);
  if (fileName === ".node-version") return parseNodeVersion(text, relativePath);
  if (fileName === ".tool-versions") return parseToolVersions(text, relativePath);
  if (isDockerfile(fileName)) return parseDockerfile(text, relativePath);
  if (isWorkflow(relativePath)) return parseGitHubActions(text, relativePath);
  return { evidence: [], diagnostics: [] };
}

export async function scanProject(options: ScanOptions = {}): Promise<ScanResult> {
  const root = path.resolve(options.cwd ?? process.cwd());
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error(`${root} is not a directory.`);
  const files = await discoverFiles(root);
  const evidence: ScanResult["evidence"] = [];
  const diagnostics: ScanResult["diagnostics"] = [];

  for (const relativePath of files) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
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
        location: { file: relativePath, line: 1, column: 1 },
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
