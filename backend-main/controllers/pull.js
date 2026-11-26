const o = require("../vcs/objects");
const r = require("../vcs/repo");
const w = require("../vcs/workdir");
const rem = require("../vcs/remote");
const { mergeInto } = require("./merge");

// Download the remote branch and combine it with ours. Used by `pull` and `clone`.
async function pullBranch(root, branch) {
  const remote = await rem.requireRemote(root);
  const token = await rem.getToken(); // public repositories can be pulled without logging in

  let branches;
  try {
    ({ branches } = await rem.call("GET", remote.server, `/repo/${remote.repoId}/refs`, { token }));
  } catch (err) {
    if (err.status === 404) throw new Error("Repository not found. If it is private, run `kgit login` as its owner.");
    throw err;
  }
  const remoteTip = branches.find((b) => b.name === branch)?.hash;
  if (!remoteTip) {
    throw new Error(
      branches.length
        ? `The remote has no branch '${branch}'. Available: ${branches.map((b) => b.name).join(", ")}`
        : "The remote repository is empty. Push something first."
    );
  }

  const localTip = await r.readRef(root, branch);
  if (localTip === remoteTip) {
    await rem.writeRemoteRef(root, branch, remoteTip);
    console.log("Already up to date.");
    return;
  }

  const count = await rem.fetchObjects(root, remote, token, remoteTip);
  await rem.writeRemoteRef(root, branch, remoteTip);
  console.log(`Fetched ${count} new object(s).`);

  if (!localTip) {
    // Nothing here yet: simply check the remote branch out.
    const status = await w.computeStatus(root);
    if (!w.isClean(status)) throw new Error("You have uncommitted changes. Commit them before pulling.");
    const files = await r.flattenTree(root, (await o.readCommit(remoteTip, root)).tree);
    const clash = status.untracked.filter((p) => files[p] !== undefined);
    if (clash.length) throw new Error(`Untracked files would be overwritten: ${clash.join(", ")}`);
    await w.applyCommit(root, remoteTip);
    await r.writeRef(root, branch, remoteTip);
    console.log(`Checked out ${branch} at ${remoteTip.slice(0, 8)}`);
    return;
  }
  await mergeInto(root, remoteTip, `origin/${branch}`);
}

async function pullRepo() {
  const root = await r.requireRepoRoot();
  await pullBranch(root, await r.currentBranch(root));
}

module.exports = { pullRepo, pullBranch };