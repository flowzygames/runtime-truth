import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatGithub, shouldFail } from "./formatters.js";
import { inspectProject } from "./inspect.js";
import type { FailOn } from "./types.js";

function actionInput(name: string): string | undefined {
  const dashed = `INPUT_${name.toUpperCase()}`;
  const underscored = dashed.replace(/-/g, "_");
  return process.env[dashed] || process.env[underscored];
}

function parseFailOn(value: string | undefined): FailOn {
  if (value === "warning" || value === "never" || value === "error") return value;
  return "error";
}

async function appendOutput(file: string | undefined, lines: string[]): Promise<void> {
  if (!file) return;
  await appendFile(file, `${lines.join("\n")}\n`, "utf8");
}

export async function runAction(): Promise<number> {
  const cwd = path.resolve(process.env.GITHUB_WORKSPACE ?? process.cwd(), actionInput("PATH") ?? ".");
  const failOn = parseFailOn(actionInput("FAIL-ON"));
  try {
    const result = await inspectProject({ cwd });
    process.stdout.write(formatGithub(result));
    await appendOutput(process.env.GITHUB_OUTPUT, [
      `status=${result.status}`,
      `sources=${result.summary.sources}`,
      `errors=${result.summary.errors}`,
      `warnings=${result.summary.warnings}`,
    ]);
    await appendOutput(process.env.GITHUB_STEP_SUMMARY, [
      "## RuntimeTruth",
      "",
      `**${result.status}** — ${result.summary.sources} sources, ${result.summary.errors} errors, ${result.summary.warnings} warnings.`,
    ]);
    return shouldFail(result, failOn) ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`::error title=RuntimeTruth::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}\n`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runAction().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
