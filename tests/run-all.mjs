import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const files = readdirSync(new URL(".", import.meta.url))
  .filter((name) => /\.(?:cjs|mjs)$/.test(name) && name !== "run-all.mjs")
  .sort();

for (const name of files) {
  process.stdout.write(`\n== ${name} ==\n`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\nAll ${files.length} test files passed.`);
