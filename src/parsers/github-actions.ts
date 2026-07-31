import { createEvidence, type ParseOutput, type SourceLocation } from "../types.js";
import {
  leadingWhitespace,
  lineLocation,
  stripInlineComment,
  stripMatchingQuotes,
} from "./shared.js";

interface MatrixValue {
  value: string;
  location: SourceLocation;
  key: string;
}

interface SetupNodeInput {
  value: string;
  location: SourceLocation;
  lineIndex: number;
}

function cleanYamlScalar(value: string): string {
  return stripMatchingQuotes(stripInlineComment(value).trim());
}

function splitInlineList(value: string, file: string, line: number, baseColumn: number): MatrixValue[] {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("[") && trimmed.endsWith("]"))) return [];
  const body = trimmed.slice(1, -1);
  const result: MatrixValue[] = [];
  let segmentStart = 0;
  let quote: string | null = null;
  const pushSegment = (end: number): void => {
    const segment = body.slice(segmentStart, end);
    const raw = cleanYamlScalar(segment);
    if (raw) {
      const offsetInSegment = segment.search(/\S/);
      result.push({
        value: raw,
        location: lineLocation(file, line, baseColumn + 1 + segmentStart + Math.max(0, offsetInSegment)),
        key: "",
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

function parseMatrices(lines: string[], file: string): Map<string, MatrixValue[]> {
  const matrices = new Map<string, MatrixValue[]>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[2];
    const inline = match[3];
    const indent = match[1].length;
    const inlineColumn = line.indexOf(inline, line.indexOf(":" ) + 1) + 1;
    if (inline.startsWith("[")) {
      const values = splitInlineList(inline, file, index + 1, inlineColumn);
      if (values.length > 0) matrices.set(key, values.map((item) => ({ ...item, key })));
      continue;
    }
    if (inline && !inline.startsWith("{") && !inline.startsWith("${{")) continue;
    if (inline) continue;
    const values: MatrixValue[] = [];
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

  // GitHub Actions also permits matrix values as objects under `include`.
  // Only collect the `node` field used by setup-node; other fields such as
  // `os` must not become runtime evidence by accident.
  for (const [index, line] of lines.entries()) {
    const include = line.match(/^(\s*)include\s*:\s*$/);
    if (!include) continue;
    const includeIndent = include[1].length;
    let belongsToMatrix = false;
    for (let parent = index - 1; parent >= 0; parent -= 1) {
      const candidate = lines[parent];
      if (!candidate.trim() || candidate.trimStart().startsWith("#")) continue;
      const parentIndent = leadingWhitespace(candidate);
      if (parentIndent <= includeIndent) {
        belongsToMatrix = parentIndent < includeIndent && /^\s*matrix\s*:\s*$/.test(candidate);
        break;
      }
    }
    if (!belongsToMatrix) continue;

    const values: MatrixValue[] = [];
    let entryIndent: number | null = null;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (!candidate.trim() || candidate.trimStart().startsWith("#")) continue;
      const indent = leadingWhitespace(candidate);
      if (indent <= includeIndent) break;
      const entry = candidate.match(/^(\s*)-\s*(.*?)\s*$/);
      if (entry) {
        entryIndent = entry[1].length;
        const field = entry[2].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
        if (field?.[1] === "node" && field[2]) {
          const raw = cleanYamlScalar(field[2]);
          if (raw) {
            const column = candidate.indexOf(field[2], candidate.indexOf(":") + 1) + 1;
            values.push({ value: raw, location: lineLocation(file, cursor + 1, column), key: "node" });
          }
        }
        continue;
      }
      if (entryIndent === null || indent <= entryIndent) break;
      const field = candidate.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
      if (field?.[1] !== "node" || !field[2]) continue;
      const raw = cleanYamlScalar(field[2]);
      if (raw) {
        const column = candidate.indexOf(field[2], candidate.indexOf(":") + 1) + 1;
        values.push({ value: raw, location: lineLocation(file, cursor + 1, column), key: "node" });
      }
    }
    if (values.length > 0) matrices.set("node", values);
  }

  // Also understand compact `matrix: { node: [18, 20] }` forms.
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

function setupNodeInputs(lines: string[], file: string): SetupNodeInput[] {
  const inputs: SetupNodeInput[] = [];
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
      const column = input[1] ? line.indexOf(input[1], line.indexOf(":" ) + 1) + 1 : line.length + 1;
      inputs.push({ value, location: lineLocation(file, cursor + 1, column), lineIndex: cursor });
      break;
    }
  }
  return inputs;
}

function referencedMatrixKey(expression: string): string | null {
  const match = expression.match(/\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/);
  return match?.[1] ?? null;
}

export function parseGitHubActions(text: string, file: string): ParseOutput {
  const evidence: ParseOutput["evidence"] = [];
  const diagnostics: ParseOutput["diagnostics"] = [];
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
          location: input.location,
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
            context: `matrix.${matrixKey}`,
          }),
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
              label: "GitHub Actions setup-node",
            }),
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
          label: "GitHub Actions setup-node",
        }),
      );
    }
  }

  return { evidence, diagnostics };
}
