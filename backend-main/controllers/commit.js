const os = require("os");
const o = require("../vcs/objects");
const r = require("../vcs/repo");

async function commitRepo(message) {
  const root = await r.requireRepoRoot();
  if (!message || !String(message).trim()) throw new Error("Commit message cannot be empty");

  const index = await r.readIndex(root);
  if (Object.keys(index).length === 0) throw new Error("Nothing to commit. Use `add` first.");

  const tree = await r.treeFromIndex(root, index);
  const branch = await r.currentBranch(root);
  const parent = await r.readRef(root, branch);

  // Same tree as the last commit => nothing changed.
  if (parent && (await o.readCommit(parent, root)).tree === tree) {
    console.log("Nothing to commit, working tree unchanged.");
    return;
  }

  const author = process.env.KGIT_AUTHOR || os.userInfo().username;
  const hash = await o.writeCommit({ tree, parent, author, message: String(message) }, root);
  await r.writeRef(root, branch, hash);

  console.log(`[${branch} ${hash.slice(0, 8)}] ${message}`);
  console.log(`${Object.keys(index).length} file(s) in this snapshot`);
}

module.exports = { commitRepo };
