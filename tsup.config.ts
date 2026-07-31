import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    action: "src/action.ts"
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  clean: true,
  dts: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  outDir: "dist"
});
