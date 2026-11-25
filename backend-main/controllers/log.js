const o = require("../vcs/objects");
const r = require("../vcs/repo");

// Walk the commit graph from the branch tip back through the parent pointers.
async function logRepo() {
  const root = await r.requireRepoRoot();
  let hash = await r.readRef(root, await r.currentBranch(root));
  if (!hash) {
    console.log("No commits yet.");
    return;
  }
  while (hash) {
    const c = await o.readCommit(hash, root);
    console.log(`commit ${c.hash}`);
    console.log(`Author: ${c.author}`);
    console.log(`Date:   ${c.time}`);
    console.log(`\n    ${c.message}\n`);
    hash = c.parent || null;
  }
}

module.exports = { logRepo };