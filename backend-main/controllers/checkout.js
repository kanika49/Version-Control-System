const o = require("../vcs/objects");
const r = require("../vcs/repo");
const w = require("../vcs/workdir");

// `checkout <branch>` switches branches; `checkout -b <name>` creates one and switches to it.
async function checkoutRepo(name, { create = false } = {}) {
  const root = await r.requireRepoRoot();
  const current = await r.currentBranch(root);

  if (create) {
    w.assertValidBranchName(name);
    if (await r.readRef(root, name)) throw new Error(`A branch named '${name}' already exists`);
    const tip = await r.readRef(root, current);
    if (!tip) throw new Error("Cannot create a branch before the first commit");
    await r.writeRef(root, name, tip);
    await w.writeHead(root, name); // same commit, so your files and staged changes stay as they are
    console.log(`Switched to a new branch '${name}'`);
    return;
  }

  const tip = await r.readRef(root, name);
  if (!tip) throw new Error(`No such branch: '${name}'`);
  if (name === current) {
    console.log(`Already on '${name}'`);
    return;
  }

  // Safety: never throw away uncommitted work.
  const status = await w.computeStatus(root);
  if (!w.isClean(status)) {
    throw new Error("You have uncommitted changes. Commit them (or restore them) before switching branches.");
  }
  // Safety: don't overwrite untracked files the other branch also has.
  const target = await r.flattenTree(root, (await o.readCommit(tip, root)).tree);
  const clash = status.untracked.filter((p) => target[p] !== undefined);
  if (clash.length) throw new Error(`Untracked files would be overwritten: ${clash.join(", ")}`);

  await w.applyCommit(root, tip);
  await w.writeHead(root, name);
  console.log(`Switched to branch '${name}'`);
}

module.exports = { checkoutRepo };