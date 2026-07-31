import { describe, expect, it } from "vitest";

import { parseCliArgs, runCli } from "../src/cli.js";

describe("CLI", () => {
  it("supports check, output formats, and failure thresholds", () => {
    expect(
      parseCliArgs(["check", "fixtures", "--format=json", "--fail-on", "warning"], {
        cwd: "/tmp",
        color: true,
      }),
    ).toMatchObject({
      command: "check",
      cwd: "/tmp/fixtures",
      format: "json",
      failOn: "warning",
      color: false,
    });
  });

  it("returns usage errors as exit code 2", async () => {
    let stderr = "";
    const exitCode = await runCli(["--wat"], {
      stdout: () => undefined,
      stderr: (value) => {
        stderr += value;
      },
    });
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown option --wat");
  });
});
