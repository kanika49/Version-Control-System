const r = require("../vcs/repo");
const rem = require("../vcs/remote");

// `kgit remote <repository-id>`: link this folder to a repository on the website.
async function remoteCmd(repoId) {
  const root = await r.requireRepoRoot();
  if (!/^[0-9a-fA-F]{24}$/.test(repoId || "")) {
    throw new Error("That does not look like a repository id. Copy it from the repository page.");
  }
  const server = await rem.serverUrl();
  try {
    await rem.call("GET", server, `/repo/${repoId}/refs`, { token: await rem.getToken() });
  } catch (err) {
    if (err.status === 404) throw new Error("Repository not found. Check the id (private repositories need `kgit login` as the owner).");
    throw err;
  }
  const cfg = await rem.readConfig(root);
  cfg.remote = { server, repoId };
  await rem.writeConfig(root, cfg);
  console.log(`Remote set: ${server}  (repository ${repoId})`);
}

module.exports = { remoteCmd };