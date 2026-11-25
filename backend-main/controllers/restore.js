const r = require("../vcs/repo");
const w = require("../vcs/workdir");

// Rebuild the working folder (and the index) from a commit. Replaces the old `revert`.
async function restoreRepo(commitRef) {
  const root = await r.requireRepoRoot();
  const hash = await r.resolveCommit(root, commitRef);
  const count = await w.applyCommit(root, hash);
  console.log(`Restored ${count} file(s) from commit ${hash.slice(0, 8)}`);
}

module.exports = { restoreRepo };