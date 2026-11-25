// Helpers shared by all commands: finding the repo, the index (staging area), branches/HEAD, trees.

const fs = require("fs").promises;
const path = require("path");
const o = require("./objects");

// Never tracked: the repo itself, Git, dependencies, and secrets.
const IGNORED = new Set([o.REPO_DIR, ".git", "node_modules", ".env"]);

const toPosix = (p) => p.split(path.sep).join("/");
const kgitPath = (root, ...parts) => path.join(root, o.REPO_DIR, ...parts);

// Walk up from the current folder until a ".kgit" folder is found (like Git does).
async function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    try {
      await fs.access(path.join(dir, o.REPO_DIR));
      return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function requireRepoRoot() {
  const root = await findRepoRoot();
  if (!root) throw new Error("Not a kgit repository. Run `init` first.");
  return root;
}

// ---- index: the staging area, stored as { "src/a.js": "<blob hash>", ... } ----
async function readIndex(root) {
  try {
    return JSON.parse(await fs.readFile(kgitPath(root, "index.json"), "utf8"));
  } catch {
    return {};
  }
}

async function writeIndex(root, index) {
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => (a < b ? -1 : 1)));
  await fs.writeFile(kgitPath(root, "index.json"), JSON.stringify(sorted, null, 2));
}

// ---- branches: HEAD says which branch is checked out; the branch file holds its latest commit ----
async function currentBranch(root) {
  const head = (await fs.readFile(kgitPath(root, "HEAD"), "utf8")).trim();
  const m = head.match(/^ref: refs\/heads\/(.+)$/);
  if (!m) throw new Error("HEAD is not on a branch");
  return m[1];
}

async function readRef(root, branch) {
  try {
    return (await fs.readFile(kgitPath(root, "refs", "heads", branch), "utf8")).trim() || null;
  } catch {
    return null;
  }
}

async function writeRef(root, branch, hash) {
  const file = kgitPath(root, "refs", "heads", branch);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, hash + "\n");
}

// Accepts "HEAD", a full hash, or a unique prefix (at least 4 characters), like Git.
async function resolveCommit(root, input) {
  if (input === "HEAD") {
    const tip = await readRef(root, await currentBranch(root));
    if (!tip) throw new Error("No commits yet");
    return tip;
  }
  if (!/^[0-9a-f]{4,64}$/i.test(input)) throw new Error(`Invalid commit id: ${input}`);
  const id = input.toLowerCase();
  const dir = path.join(o.objectsDir(root), id.slice(0, 2));
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {}
  const matches = names.filter((n) => (id.slice(0, 2) + n).startsWith(id)).map((n) => id.slice(0, 2) + n);
  const commits = [];
  for (const h of matches) {
    if ((await o.readObject(h, root)).type === "commit") commits.push(h);
  }
  if (commits.length === 0) throw new Error(`No commit found for ${input}`);
  if (commits.length > 1) throw new Error(`Ambiguous commit id ${input}, use more characters`);
  return commits[0];
}

// Turn the flat index into nested tree objects and return the root tree hash.
async function treeFromIndex(root, index) {
  const top = {};
  for (const [p, hash] of Object.entries(index)) {
    const parts = p.split("/");
    let node = top;
    for (const dir of parts.slice(0, -1)) node = node[dir] = node[dir] || {};
    node[parts[parts.length - 1]] = hash;
  }
  async function build(node) {
    const entries = [];
    for (const [name, val] of Object.entries(node)) {
      if (typeof val === "string") entries.push({ mode: "100644", type: "blob", name, hash: val });
      else entries.push({ mode: "040000", type: "tree", name, hash: await build(val) });
    }
    return o.writeTree(entries, root);
  }
  return build(top);
}

// Reverse: read a tree recursively into a flat { path: blobHash } map.
async function flattenTree(root, treeHash, prefix = "") {
  const out = {};
  for (const e of await o.readTree(treeHash, root)) {
    const p = prefix + e.name;
    if (e.type === "tree") Object.assign(out, await flattenTree(root, e.hash, p + "/"));
    else out[p] = e.hash;
  }
  return out;
}

module.exports = {
  IGNORED, toPosix, kgitPath, findRepoRoot, requireRepoRoot,
  readIndex, writeIndex, currentBranch, readRef, writeRef,
  resolveCommit, treeFromIndex, flattenTree,
};