#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { formatGithub, formatJson, formatPretty, shouldFail } from "./formatters.js";
import { inspectProject } from "./inspect.js";
import type { FailOn, OutputFormat } from "./types.js";

export const VERSION = "0.1.0";

export interface CliOptions {
  command: "check" | "help" | "version";
  cwd: string;
  format: OutputFormat;
  failOn: FailOn;
  color: boolean;
}

export interface CliIo {
  stdout(value: string): void;
  stderr(value: string): void;
}

const HELP = `RuntimeTruth — find Node.js version drift before CI does

Usage:
  runtimetruth check [path] [options]
  runtimetruth [path] [options]

Options:
  --format <pretty|json|github>   Output format (default: pretty)
  --fail-on <error|warning|never> Exit threshold (default: error)
  --json                          Shortcut for --format json
  --no-color                      Disable ANSI colors
  -h, --help                      Show help
  -v, --version                   Show version
`;

function takeValue(argv: string[], index: number, name: string): [string, number] {
  const argument = argv[index];
  if (argument === undefined) throw new Error(`${name} requires a value.`);
  const equals = argument.indexOf("=");
  if (equals >= 0) return [argument.slice(equals + 1), index];
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${name} requires a value.`);
  return [value, index + 1];
}

export function parseCliArgs(
  argv: string[],
  environment: { cwd?: string; color?: boolean } = {},
): CliOptions {
  let command: CliOptions["command"] = "check";
  let cwd = environment.cwd ?? process.cwd();
  let format: OutputFormat = "pretty";
  let failOn: FailOn = "error";
  let color = environment.color ?? Boolean(process.stdout.isTTY);
  let pathSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "check" && index === 0) continue;
    if (argument === "-h" || argument === "--help") {
      command = "help";
      continue;
    }
    if (argument === "-v" || argument === "--version") {
      command = "version";
      continue;
    }
    if (argument === "--json") {
      format = "json";
      continue;
    }
    if (argument === "--no-color") {
      color = false;
      continue;
    }
    if (argument === "--color") {
      color = true;
      continue;
    }
    if (argument === "--format" || argument.startsWith("--format=")) {
      const [value, consumed] = takeValue(argv, index, "--format");
      index = consumed;
      if (!(["pretty", "json", "github"] as string[]).includes(value)) {
        throw new Error(`Unknown output format ${JSON.stringify(value)}.`);
      }
      format = value as OutputFormat;
      continue;
    }
    if (argument === "--fail-on" || argument.startsWith("--fail-on=")) {
      const [value, consumed] = takeValue(argv, index, "--fail-on");
      index = consumed;
      if (!(["error", "warning", "never"] as string[]).includes(value)) {
        throw new Error(`Unknown --fail-on value ${JSON.stringify(value)}.`);
      }
      failOn = value as FailOn;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option ${argument}.`);
    if (pathSeen) throw new Error(`Unexpected positional argument ${JSON.stringify(argument)}.`);
    cwd = path.resolve(environment.cwd ?? process.cwd(), argument);
    pathSeen = true;
  }

  if (format !== "pretty") color = false;
  return { command, cwd, format, failOn, color };
}

export async function runCli(
  argv = process.argv.slice(2),
  io: CliIo = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  },
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    io.stderr(`RuntimeTruth: ${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return 2;
  }
  if (options.command === "help") {
    io.stdout(HELP);
    return 0;
  }
  if (options.command === "version") {
    io.stdout(`${VERSION}\n`);
    return 0;
  }

  try {
    const result = await inspectProject({ cwd: options.cwd });
    if (options.format === "json") io.stdout(formatJson(result));
    else if (options.format === "github") io.stdout(formatGithub(result));
    else io.stdout(formatPretty(result, { color: options.color, cwd: process.cwd() }));
    return shouldFail(result, options.failOn) ? 1 : 0;
  } catch (error) {
    io.stderr(`RuntimeTruth: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

function isDirectInvocation(): boolean {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
