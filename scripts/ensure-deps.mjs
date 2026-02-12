import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const ensureMjsShim = (packageName, namedExports) => {
  const distDir = join(root, "node_modules", packageName, "dist");
  const cjsFile = join(distDir, "index.cjs");
  const mjsFile = join(distDir, "index.mjs");
  if (!existsSync(cjsFile) || existsSync(mjsFile)) {
    return;
  }

  mkdirSync(distDir, { recursive: true });
  const exportLines =
    namedExports.length === 0
      ? ""
      : `const { ${namedExports.join(", ")} } = mod;\nexport { ${namedExports.join(", ")} };\n`;

  const shim = `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mod = require("./index.cjs");
${exportLines}\
export default mod;
`;
  writeFileSync(mjsFile, shim, "utf8");
  console.log(`[jarvis] Repaired missing ESM entry: node_modules/${packageName}/dist/index.mjs`);
};

ensureMjsShim("fdir", ["fdir"]);
ensureMjsShim("tinyglobby", [
  "glob",
  "globSync",
  "escapePath",
  "isDynamicPattern",
  "convertPathToPattern"
]);
