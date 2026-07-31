#!/usr/bin/env node
import { O as OutputFormat, F as FailOn } from './types-BcSf6TtJ.js';

declare const VERSION = "0.1.0";
interface CliOptions {
    command: "check" | "help" | "version";
    cwd: string;
    format: OutputFormat;
    failOn: FailOn;
    color: boolean;
}
interface CliIo {
    stdout(value: string): void;
    stderr(value: string): void;
}
declare function parseCliArgs(argv: string[], environment?: {
    cwd?: string;
    color?: boolean;
}): CliOptions;
declare function runCli(argv?: string[], io?: CliIo): Promise<number>;

export { type CliIo, type CliOptions, VERSION, parseCliArgs, runCli };
