import type { SourceLocation } from "../types.js";

export function offsetToLocation(text: string, file: string, offset: number): SourceLocation {
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

export function lineLocation(file: string, line: number, column = 1): SourceLocation {
  return { file, line, column };
}

export function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Remove a YAML/shell comment while respecting simple single and double quotes. */
export function stripInlineComment(value: string): string {
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

export function leadingWhitespace(value: string): number {
  return value.match(/^\s*/)?.[0].length ?? 0;
}
