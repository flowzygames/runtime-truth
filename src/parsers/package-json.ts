import { createEvidence, type ParseOutput, type RuntimeEvidence } from "../types.js";
import { JsonParseError, objectProperty, parseJsonAst, stringValue, type JsonNode } from "./json-ast.js";
import { offsetToLocation } from "./shared.js";

function stringOffset(node: JsonNode): number {
  return node.kind === "string" ? node.start + 1 : node.start;
}

function evidenceFromString(
  text: string,
  file: string,
  node: JsonNode,
  options: Pick<RuntimeEvidence, "role" | "source" | "label"> & { context?: string },
): RuntimeEvidence | null {
  const value = stringValue(node);
  if (value === undefined || !value.trim()) return null;
  return createEvidence({
    ...options,
    location: offsetToLocation(text, file, stringOffset(node)),
    raw: value,
    constraint: value.trim(),
  });
}

function parseDevRuntimeNode(
  text: string,
  file: string,
  node: JsonNode,
  index?: number,
): RuntimeEvidence | null {
  if (node.kind === "string") {
    return evidenceFromString(text, file, node, {
      role: "development",
      source: "package-dev-engines",
      label: "package.json devEngines.runtime",
      context: index === undefined ? undefined : `runtime entry ${index + 1}`,
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
    context: index === undefined ? undefined : `runtime entry ${index + 1}`,
  });
}

export function parsePackageJson(text: string, file = "package.json"): ParseOutput {
  const evidence: RuntimeEvidence[] = [];
  const diagnostics: ParseOutput["diagnostics"] = [];
  let root: JsonNode;
  try {
    root = parseJsonAst(text);
  } catch (error) {
    const offset = error instanceof JsonParseError ? error.offset : 0;
    diagnostics.push({
      code: "invalid-package-json",
      severity: "warning",
      message: `Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`,
      location: offsetToLocation(text, file, offset),
    });
    return { evidence, diagnostics };
  }

  if (root.kind !== "object") {
    diagnostics.push({
      code: "invalid-package-json",
      severity: "warning",
      message: `${file} must contain a JSON object.`,
      location: offsetToLocation(text, file, root.start),
    });
    return { evidence, diagnostics };
  }

  const engines = objectProperty(root, "engines")?.value;
  const enginesNode = objectProperty(engines, "node")?.value;
  if (enginesNode) {
    const item = evidenceFromString(text, file, enginesNode, {
      role: "support",
      source: "package-engines",
      label: "package.json engines.node",
    });
    if (item) evidence.push(item);
  }

  const volta = objectProperty(root, "volta")?.value;
  const voltaNode = objectProperty(volta, "node")?.value;
  if (voltaNode) {
    const item = evidenceFromString(text, file, voltaNode, {
      role: "development",
      source: "package-volta",
      label: "package.json volta.node",
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
