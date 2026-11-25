const fs = require("fs").promises;
const path = require("path");
const o = require("../vcs/objects");
const r = require("../vcs/repo");

// Rebuild the working folder (and the index) from a commit. Replaces the old `revert`.
async function restoreRepo(commitRef) {
  const root = await r.requireRepoRoot();
  const hash = await r.resolveCommit(root, commitRef);
  const commit = await o.readCommit(hash, root);
  const target = await r.flattenTree(root, commit.tree);
  const current = await r.readIndex(root);

  // Delete tracked files that did not exist in that commit.
  for (const p of Object.keys(current)) {
    if (target[p] === undefined) await fs.rm(path.join(root, p), { force: true });
  }
  // Write every file from that commit, including files in sub-folders.
  for (const [p, blobHash] of Object.entries(target)) {
    const file = path.join(root, p);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, (await o.readObject(blobHash, root)).content);
  }
  await r.writeIndex(root, target);
  console.log(`Restored ${Object.keys(target).length} file(s) from commit ${hash.slice(0, 8)}`);
}

module.exports = { restoreRepo };