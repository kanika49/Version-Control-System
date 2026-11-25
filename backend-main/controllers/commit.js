const os = require("os");
const o = require("../vcs/objects");
const r = require("../vcs/repo");
const m = require("../vcs/merge");

async function commitRepo(message) {
  const root = await r.requireRepoRoot();
  if (!message || !String(message).trim()) throw new Error("Commit message cannot be empty");

  // If a merge is waiting to be finished, every conflict must be fixed and re-added first.
  const merging = await m.readMergeState(root);
  if (merging && merging.conflicts.length) {
    throw new Error(`Unresolved conflicts in: ${merging.conflicts.join(", ")}. Fix them, run \`add\` on each, then commit.`);
  }

  const index = await r.readIndex(root);
  if (Object.keys(index).length === 0) throw new Error("Nothing to commit. Use `add` first.");

  const tree = await r.treeFromIndex(root, index);
  const branch = await r.currentBranch(root);
  const parent = await r.readRef(root, branch);

  // Same tree as the last commit => nothing changed (a merge commit is always allowed).
  if (!merging && parent && (await o.readCommit(parent, root)).tree === tree) {
    console.log("Nothing to commit, working tree unchanged.");
    return;
  }

  const parents = parent ? [parent] : [];
  if (merging) parents.push(merging.head); // two parents => this is a merge commit

  const author = process.env.KGIT_AUTHOR || os.userInfo().username;
  const hash = await o.writeCommit({ tree, parents, author, message: String(message) }, root);
  await r.writeRef(root, branch, hash);
  if (merging) await m.clearMergeState(root);

  console.log(`[${branch} ${hash.slice(0, 8)}] ${message}`);
  console.log(`${Object.keys(index).length} file(s) in this snapshot`);
}

module.exports = { commitRepo };
