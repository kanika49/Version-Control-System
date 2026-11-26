const o = require("../vcs/objects");
const r = require("../vcs/repo");
const rem = require("../vcs/remote");
const m = require("../vcs/merge");

// Send the current branch to the server. Only objects the server does not have yet are uploaded.
async function pushRepo() {
  const root = await r.requireRepoRoot();
  const branch = await r.currentBranch(root);
  const localTip = await r.readRef(root, branch);
  if (!localTip) throw new Error("Nothing to push: this branch has no commits yet.");

  const remote = await rem.requireRemote(root);
  const token = await rem.requireToken();
  const { branches } = await rem.call("GET", remote.server, `/repo/${remote.repoId}/refs`, { token });
  const remoteTip = branches.find((b) => b.name === branch)?.hash ?? null;

  if (remoteTip === localTip) {
    await rem.writeRemoteRef(root, branch, localTip);
    console.log("Everything up-to-date.");
    return;
  }

  // The server only accepts fast-forwards, so its tip must be one of our ancestors.
  let skip = new Set();
  if (remoteTip) {
    const known = await rem.existsLocal(root, remoteTip);
    if (!known || !(await m.ancestors(root, localTip)).has(remoteTip)) {
      throw new Error("Rejected: the remote branch has commits you don't have. Run `kgit pull`, then push again.");
    }
    skip = await m.ancestors(root, remoteTip); // those commits are already on the server
  }

  const all = await rem.collectForPush(root, localTip, skip);
  const missing = await rem.missingOnRemote(remote, token, all);
  console.log(`Objects: ${all.length} checked, ${missing.length} new to upload.`);
  await rem.uploadObjects(root, remote, token, missing);

  await rem.call("POST", remote.server, `/repo/${remote.repoId}/refs/update`, {
    token,
    body: { branch, old: remoteTip, new: localTip },
  });
  await rem.writeRemoteRef(root, branch, localTip);
  const range = remoteTip ? `${remoteTip.slice(0, 8)}..${localTip.slice(0, 8)}` : `[new branch] ${localTip.slice(0, 8)}`;
  console.log(`${branch} -> ${branch}   ${range}`);
}

module.exports = { pushRepo };