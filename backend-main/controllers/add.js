const fs = require("fs").promises;
const path = require("path");
const o = require("../vcs/objects");
const { IGNORED, toPosix, requireRepoRoot, readIndex, writeIndex } = require("../vcs/repo");

// Collect every file under a folder, skipping ignored names.
async function collectFiles(dir) {
  const out = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    if (IGNORED.has(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...(await collectFiles(full)));
    else if (item.isFile()) out.push(full);
  }
  return out;
}

async function addRepo(target) {
  const root = await requireRepoRoot();
  const abs = path.resolve(target);
  const rel = toPosix(path.relative(root, abs));
  if (rel.startsWith("..")) throw new Error("Path is outside the repository");

  const index = await readIndex(root);
  let stat = null;
  try {
    stat = await fs.stat(abs);
  } catch {}

  // File no longer exists: stage its deletion if we were tracking it.
  if (!stat) {
    if (index[rel] === undefined) throw new Error(`pathspec '${target}' did not match any files`);
    delete index[rel];
    await writeIndex(root, index);
    console.log(`Staged deletion of ${rel}`);
    return;
  }

  const files = stat.isDirectory() ? await collectFiles(abs) : [abs];
  const added = new Set();
  for (const file of files) {
    const p = toPosix(path.relative(root, file));
    if (/[\t\n]/.test(p)) throw new Error(`Unsupported character in file name: ${p}`);
    index[p] = await o.writeBlob(await fs.readFile(file), root);
    added.add(p);
  }

  // When adding a folder, files that disappeared from it are staged as deletions.
  if (stat.isDirectory()) {
    const prefix = rel === "" ? "" : rel + "/";
    for (const p of Object.keys(index)) {
      if (p.startsWith(prefix) && !added.has(p)) delete index[p];
    }
  }

  await writeIndex(root, index);
  console.log(`Added ${added.size} file(s).`);
}

module.exports = { addRepo };
