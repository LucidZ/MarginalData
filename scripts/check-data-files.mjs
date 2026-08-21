// Runs after `vite build`. Scans src/**/*.{ts,tsx} for string literals that
// look like static data paths (e.g. "/data/wildfire/state-trends.json") and
// verifies each one actually exists in dist/ — i.e. would actually be served
// in production.
//
// This exists because a story's data file can be silently excluded from the
// deploy (gitignored, never generated, moved) with nothing failing until a
// reader hits an infinite "Loading..." spinner in production. This check
// turns that into a build failure instead.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

// Matches string literals starting with /data/ inside quotes or backticks,
// e.g. "/data/foo.json" or `/data/foo/${bar}.json`. We only check literals
// with no template interpolation — a path built from a runtime variable
// can't be verified statically, so those are left for the fetch's own
// error handling to surface at runtime.
const DATA_PATH_RE = /["'`](\/data\/[^"'`$]+?\.[a-zA-Z0-9]+)["'`]/g;

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(fullPath);
      if (/\.(ts|tsx)$/.test(entry.name)) return [fullPath];
      return [];
    })
  );
  return files.flat();
}

async function findReferencedDataPaths() {
  const files = await collectSourceFiles(srcDir);
  const referenced = new Map(); // dataPath -> Set of source files referencing it

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    for (const match of content.matchAll(DATA_PATH_RE)) {
      const dataPath = match[1];
      const relFile = path.relative(rootDir, file);
      if (!referenced.has(dataPath)) referenced.set(dataPath, new Set());
      referenced.get(dataPath).add(relFile);
    }
  }

  return referenced;
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const referenced = await findReferencedDataPaths();
  const missing = [];

  for (const [dataPath, sources] of referenced) {
    const distPath = path.join(distDir, dataPath);
    if (!(await fileExists(distPath))) {
      missing.push({ dataPath, sources: [...sources] });
    }
  }

  if (missing.length > 0) {
    console.error(
      `\n✗ check-data-files: ${missing.length} referenced data file(s) are missing from dist/ — they will 404 in production:\n`
    );
    for (const { dataPath, sources } of missing) {
      console.error(`  ${dataPath}`);
      for (const source of sources) {
        console.error(`    referenced in ${source}`);
      }
    }
    console.error(
      "\nEither generate/commit the missing file(s) under public/, or fix the referenced path.\n"
    );
    process.exit(1);
  }

  console.log(`✓ check-data-files: ${referenced.size} referenced data file(s) all present in dist/`);
}

main();
