const r = require("../vcs/repo");
const w = require("../vcs/workdir");

// `branch` lists branches; `branch <name>` creates one at the current commit.
async function branchRepo(name) {
  const root = await r.requireRepoRoot();
  const current = await r.currentBranch(root);

  if (!name) {
    const names = await w.listBranches(root);
    if (!names.includes(current)) names.push(current);
    for (const n of names.sort()) {
      const note = n === current && !(await r.readRef(root, n)) ? " (no commits yet)" : "";
      console.log(`${n === current ? "*" : " "} ${n}${note}`);
    }
    return;
  }

  w.assertValidBranchName(name);
  if (await r.readRef(root, name)) throw new Error(`A branch named '${name}' already exists`);
  const tip = await r.readRef(root, current);
  if (!tip) throw new Error("Cannot create a branch before the first commit");
  await r.writeRef(root, name, tip);
  console.log(`Created branch '${name}' at ${tip.slice(0, 8)}`);
}

module.exports = { branchRepo };