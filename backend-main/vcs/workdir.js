// Helpers that compare the working folder, the index (staging area) and the last commit.

const fs = require("fs").promises;
const path = require("path");
const o = require("./objects");
const r = require("./repo");

// Every trackable file in the working folder, as "dir/file.txt" paths.
async function listWorkingFiles(root, dir = root, out = []) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    if (r.IGNORED.has(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await listWorkingFiles(root, full, out);
    else if (item.isFile()) out.push(r.toPosix(path.relative(root, full)));
  }
  return out;
}

// Hash a file as a blob WITHOUT storing it. Returns null if the file does not exist.
async function hashWorkingFile(root, p) {
  try {
    return o.hashObject("blob", await fs.readFile(path.join(root, p))).hash;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// { path: blobHash } for the latest commit of the current branch.
async function headFiles(root) {
  const tip = await r.readRef(root, await r.currentBranch(root));
  if (!tip) return {};
  return r.flattenTree(root, (await o.readCommit(tip, root)).tree);
}

// What changed? staged = index vs last commit, unstaged = working folder vs index.
async function computeStatus(root) {
  const head = await headFiles(root);
  const index = await r.readIndex(root);
  const staged = { new: [], modified: [], deleted: [] };
  const unstaged = { modified: [], deleted: [] };

  for (const p of Object.keys(index)) {
    if (head[p] === undefined) staged.new.push(p);
    else if (head[p] !== index[p]) staged.modified.push(p);
  }
  for (const p of Object.keys(head)) if (index[p] === undefined) staged.deleted.push(p);

  for (const [p, hash] of Object.entries(index)) {
    const now = await hashWorkingFile(root, p);
    if (now === null) unstaged.deleted.push(p);
    else if (now !== hash) unstaged.modified.push(p);
  }

  const untracked = (await listWorkingFiles(root)).filter((p) => index[p] === undefined);
  return { staged, unstaged, untracked };
}

const isClean = (s) =>
  Object.values(s.staged).every((a) => a.length === 0) &&
  Object.values(s.unstaged).every((a) => a.length === 0);

// Make the working folder and index match a commit exactly. Returns the number of files.
async function applyCommit(root, commitHash) {
  const commit = await o.readCommit(commitHash, root);
  const target = await r.flattenTree(root, commit.tree);
  const current = await r.readIndex(root);

  for (const p of Object.keys(current)) {
    if (target[p] === undefined) await fs.rm(path.join(root, p), { force: true });
  }
  for (const [p, blobHash] of Object.entries(target)) {
    const file = path.join(root, p);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, (await o.readObject(blobHash, root)).content);
  }
  await r.writeIndex(root, target);
  return Object.keys(target).length;
}

// ---- branches ----
const BRANCH_NAME = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
function assertValidBranchName(name) {
  if (!BRANCH_NAME.test(name) || name.includes("..") || name.endsWith(".lock") || name.startsWith("-")) {
    throw new Error(`'${name}' is not a valid branch name`);
  }
}

async function listBranches(root, dir = r.kgitPath(root, "refs", "heads"), prefix = "") {
  let names = [];
  let items = [];
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {}
  for (const item of items) {
    if (item.isDirectory()) names.push(...(await listBranches(root, path.join(dir, item.name), prefix + item.name + "/")));
    else names.push(prefix + item.name);
  }
  return names.sort();
}

async function writeHead(root, branch) {
  await fs.writeFile(r.kgitPath(root, "HEAD"), `ref: refs/heads/${branch}\n`);
}

module.exports = {
  listWorkingFiles, hashWorkingFile, headFiles, computeStatus, isClean,
  applyCommit, assertValidBranchName, listBranches, writeHead,
};