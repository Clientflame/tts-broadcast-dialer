#!/usr/bin/env node
/**
 * Build the server bundle with esbuild, injecting the app version
 * from git tags at build time.
 *
 * Usage: node scripts/build-server.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

function getVersion() {
  try {
    const tag = execSync("git describe --tags --always", { encoding: "utf-8" }).trim();
    return tag.startsWith("v") ? tag.slice(1) : tag;
  } catch {
    try {
      const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
      return pkg.version || "0.0.0";
    } catch {
      return "0.0.0";
    }
  }
}

const version = getVersion();
console.log(`[build-server] Injecting APP_VERSION: ${version}`);

await build({
  entryPoints: ["server/_core/index.ts"],
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  outdir: "dist",
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
});

console.log("[build-server] Server bundle built successfully.");
