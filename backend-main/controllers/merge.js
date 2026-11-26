const os = require("os");
const o = require("../vcs/objects");
const r = require("../vcs/repo");
const w = require("../vcs/workdir");
const m = require("../vcs/merge");

async function filesOf(root, commitHash) {
  return r.flattenTree(root, (await o.readCommit(commitHash, root)).tree);
}

// Merge the commit `theirsTip` into the current branch. `label` is the name shown in messages and conflict markers.
// Used by `merge <branch>` and by `pull` (where the label is e.g. "origin/main").
async function mergeInto(root, theirsTip, label) {
  const current = await r.currentBranch(root);
  const oursTip = await r.readRef(root, current);
  if (!oursTip) throw new Error("Nothing to merge into yet: no commits on this branch");

  const status = await w.computeStatus(root);
  if (!w.isClean(status)) throw new Error("You have uncommitted changes. Commit them before merging.");

  const memo = new Map();
  if ((await m.ancestors(root, oursTip, memo)).has(theirsTip)) {
    console.log("Already up to date.");
    return;
  }

  const oursFiles = await filesOf(root, oursTip);
  const theirsFiles = await filesOf(root, theirsTip);
  const guard = (files) => {
    const clash = status.untracked.filter((p) => files[p] !== undefined && oursFiles[p] === undefined);
    if (clash.length) throw new Error(`Untracked files would be overwritten: ${clash.join(", ")}`);
  };

  // Fast-forward: our branch is simply behind theirs, so just move forward (no new commit needed).
  if ((await m.ancestors(root, theirsTip, memo)).has(oursTip)) {
    guard(theirsFiles);
    await w.applyCommit(root, theirsTip);
    await r.writeRef(root, current, theirsTip);
    console.log(`Fast-forward ${oursTip.slice(0, 8)}..${theirsTip.slice(0, 8)}`);
    return;
  }

  // Real merge: compare both sides against their common ancestor.
  const baseHash = await m.findMergeBase(root, oursTip, theirsTip);
  const baseFiles = baseHash ? await filesOf(root, baseHash) : {};
  const { files, conflicts } = await m.mergeFiles(root, baseFiles, oursFiles, theirsFiles, current, label);
  guard(files);

  await m.applyMap(root, oursFiles, files);
  await r.writeIndex(root, files);

  if (conflicts.length) {
    await m.writeMergeState(root, theirsTip, conflicts.map((c) => c.path));
    for (const c of conflicts) console.log(`CONFLICT (${c.kind}): ${c.path}`);
    console.log("Automatic merge failed. Fix the conflicts, `add` each fixed file, then run `commit`.");
    process.exitCode = 1;
    return;
  }

  const tree = await r.treeFromIndex(root, files);
  const author = process.env.KGIT_AUTHOR || os.userInfo().username;
  const hash = await o.writeCommit(
    { tree, parents: [oursTip, theirsTip], author, message: `Merge branch '${label}' into ${current}` },
    root
  );
  await r.writeRef(root, current, hash);
  console.log(`Merge made by the three-way strategy. [${current} ${hash.slice(0, 8)}]`);
}

async function mergeRepo(branch, { abort = false } = {}) {
  const root = await r.requireRepoRoot();
  const current = await r.currentBranch(root);
  const state = await m.readMergeState(root);

  if (abort) {
    if (!state) throw new Error("No merge in progress");
    await w.applyCommit(root, await r.readRef(root, current)); // back to how the branch was before
    await m.clearMergeState(root);
    console.log("Merge aborted.");
    return;
  }

  if (!branch) throw new Error("Tell me which branch to merge, e.g. `merge feature`");
  if (state) throw new Error("A merge is already in progress. Fix the conflicts and commit, or run `merge --abort`.");
  if (branch === current) throw new Error("Cannot merge a branch into itself");

  const theirsTip = await r.readRef(root, branch);
  if (!theirsTip) throw new Error(`No such branch: '${branch}'`);
  return mergeInto(root, theirsTip, branch);
}

module.exports = { mergeRepo, mergeInto };