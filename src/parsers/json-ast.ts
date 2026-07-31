export interface JsonProperty {
  key: string;
  keyStart: number;
  keyEnd: number;
  value: JsonNode;
}

export interface JsonNode {
  kind: "object" | "array" | "string" | "number" | "boolean" | "null";
  start: number;
  end: number;
  value?: unknown;
  properties?: JsonProperty[];
  items?: JsonNode[];
}

export class JsonParseError extends Error {
  constructor(
    message: string,
    public readonly offset: number,
  ) {
    super(message);
    this.name = "JsonParseError";
  }
}

export function parseJsonAst(text: string): JsonNode {
  const parser = new Parser(text);
  const node = parser.parseValue();
  parser.skipWhitespace();
  if (!parser.atEnd()) parser.fail("Unexpected trailing content");
  return node;
}

export function objectProperty(node: JsonNode | undefined, key: string): JsonProperty | undefined {
  if (node?.kind !== "object") return undefined;
  return node.properties?.find((property) => property.key === key);
}

export function stringValue(node: JsonNode | undefined): string | undefined {
  return node?.kind === "string" ? (node.value as string) : undefined;
}

class Parser {
  private offset = 0;

  constructor(private readonly text: string) {}

  atEnd(): boolean {
    return this.offset >= this.text.length;
  }

  skipWhitespace(): void {
    while (!this.atEnd() && /\s/.test(this.text[this.offset])) this.offset += 1;
  }

  fail(message: string): never {
    throw new JsonParseError(message, this.offset);
  }

  parseValue(): JsonNode {
    this.skipWhitespace();
    if (this.atEnd()) this.fail("Expected a JSON value");
    const character = this.text[this.offset]!;
    if (character === "{") return this.parseObject();
    if (character === "[") return this.parseArray();
    if (character === '"') return this.parseString();
    if (character === "t") return this.parseLiteral("true", "boolean", true);
    if (character === "f") return this.parseLiteral("false", "boolean", false);
    if (character === "n") return this.parseLiteral("null", "null", null);
    if (character === "-" || /\d/.test(character)) return this.parseNumber();
    return this.fail(`Unexpected character ${JSON.stringify(character)}`);
  }

  private parseObject(): JsonNode {
    const start = this.offset;
    this.offset += 1;
    const properties: JsonProperty[] = [];
    this.skipWhitespace();
    if (this.text[this.offset] === "}") {
      this.offset += 1;
      return { kind: "object", start, end: this.offset, properties };
    }
    while (!this.atEnd()) {
      this.skipWhitespace();
      if (this.text[this.offset] !== '"') this.fail("Expected a quoted object key");
      const keyNode = this.parseString();
      const key = keyNode.value as string;
      this.skipWhitespace();
      if (this.text[this.offset] !== ":") this.fail("Expected ':' after object key");
      this.offset += 1;
      const value = this.parseValue();
      properties.push({ key, keyStart: keyNode.start, keyEnd: keyNode.end, value });
      this.skipWhitespace();
      if (this.text[this.offset] === "}") {
        this.offset += 1;
        return { kind: "object", start, end: this.offset, properties };
      }
      if (this.text[this.offset] !== ",") this.fail("Expected ',' or '}' in object");
      this.offset += 1;
    }
    return this.fail("Unterminated object");
  }

  private parseArray(): JsonNode {
    const start = this.offset;
    this.offset += 1;
    const items: JsonNode[] = [];
    this.skipWhitespace();
    if (this.text[this.offset] === "]") {
      this.offset += 1;
      return { kind: "array", start, end: this.offset, items };
    }
    while (!this.atEnd()) {
      items.push(this.parseValue());
      this.skipWhitespace();
      if (this.text[this.offset] === "]") {
        this.offset += 1;
        return { kind: "array", start, end: this.offset, items };
      }
      if (this.text[this.offset] !== ",") this.fail("Expected ',' or ']' in array");
      this.offset += 1;
    }
    return this.fail("Unterminated array");
  }

  private parseString(): JsonNode {
    const start = this.offset;
    this.offset += 1;
    while (!this.atEnd()) {
      const character = this.text[this.offset]!;
      if (character === '"') {
        this.offset += 1;
        const raw = this.text.slice(start, this.offset);
        try {
          return { kind: "string", start, end: this.offset, value: JSON.parse(raw) };
        } catch {
          return this.fail("Invalid JSON string");
        }
      }
      if (character === "\\") {
        this.offset += 2;
      } else {
        if (character === "\n" || character === "\r") this.fail("Unterminated JSON string");
        this.offset += 1;
      }
    }
    return this.fail("Unterminated JSON string");
  }

  private parseNumber(): JsonNode {
    const start = this.offset;
    const match = this.text.slice(this.offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) this.fail("Invalid JSON number");
    this.offset += match[0].length;
    return { kind: "number", start, end: this.offset, value: Number(match[0]) };
  }

  private parseLiteral(
    literal: string,
    kind: "boolean" | "null",
    value: boolean | null,
  ): JsonNode {
    const start = this.offset;
    if (!this.text.startsWith(literal, this.offset)) this.fail(`Expected ${literal}`);
    this.offset += literal.length;
    return { kind, start, end: this.offset, value };
  }
}
