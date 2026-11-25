const fs = require("fs").promises;
const path = require("path");
const { REPO_DIR } = require("../vcs/objects");
const { kgitPath, writeIndex } = require("../vcs/repo");

async function initRepo() {
  const root = process.cwd();
  try {
    await fs.access(path.join(root, REPO_DIR));
    console.log("Repository already initialised.");
    return;
  } catch {}

  await fs.mkdir(kgitPath(root, "objects"), { recursive: true });
  await fs.mkdir(kgitPath(root, "refs", "heads"), { recursive: true });
  await fs.writeFile(kgitPath(root, "HEAD"), "ref: refs/heads/main\n");
  await writeIndex(root, {});
  console.log(`Initialised empty repository in ${path.join(root, REPO_DIR)}`);
}

module.exports = { initRepo };