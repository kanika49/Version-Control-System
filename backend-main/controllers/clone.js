const fs = require("fs").promises;
const path = require("path");
const rem = require("../vcs/remote");
const w = require("../vcs/workdir");
const { initRepo } = require("./init");
const { pullBranch } = require("./pull");

// `kgit clone <repository-id> [folder]`: copy a repository from the server into a new folder.
async function cloneRepo(repoId, dir) {
  if (!/^[0-9a-fA-F]{24}$/.test(repoId || "")) {
    throw new Error("That does not look like a repository id. Copy it from the repository page.");
  }
  const server = await rem.serverUrl();
  const token = await rem.getToken();

  let info;
  try {
    info = await rem.call("GET", server, `/repo/${repoId}`, { token });
  } catch (err) {
    if (err.status === 404) throw new Error("Repository not found. If it is private, run `kgit login` as its owner.");
    throw err;
  }
  if (!info.branches || info.branches.length === 0) throw new Error("This repository is empty: there is nothing to clone yet.");

  if (!dir && /^\.+$/.test(info.name)) throw new Error("Please give a folder name: kgit clone <id> <folder>");
  const target = path.resolve(dir || info.name);
  try {
    if ((await fs.readdir(target)).length) throw new Error(`The folder '${target}' already exists and is not empty.`);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  await fs.mkdir(target, { recursive: true });
  process.chdir(target);

  await initRepo();
  const root = process.cwd();
  await rem.writeConfig(root, { remote: { server, repoId } });
  const branch = (info.branches.find((b) => b.name === "main") || info.branches[0]).name;
  await w.writeHead(root, branch);
  await pullBranch(root, branch);
  console.log(`Cloned into ${target}`);
}

module.exports = { cloneRepo };