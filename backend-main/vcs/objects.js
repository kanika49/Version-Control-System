// Content-addressable object storage (the heart of Git).
// Three object types: blob (file contents), tree (directory snapshot), commit (tree + parent + message).

const fs = require("fs").promises;
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { promisify } = require("util");

const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

const REPO_DIR = ".kgit";
const HASH_ALGO = "sha256";

function objectsDir(root) {
  return path.join(root, REPO_DIR, "objects");
}

// Hash = hash("<type> <size>\0" + content). Identical content => identical hash.
function hashObject(type, content) {
  const header = Buffer.from(`${type} ${content.length}\0`);
  const full = Buffer.concat([header, content]);
  return { hash: crypto.createHash(HASH_ALGO).update(full).digest("hex"), full };
}

// Stored compressed at objects/ab/cdef...; skipped if it already exists (deduplication).
async function writeObject(type, content, root) {
  const { hash, full } = hashObject(type, content);
  const dir = path.join(objectsDir(root), hash.slice(0, 2));
  const file = path.join(dir, hash.slice(2));
  try {
    await fs.access(file);
    return hash;
  } catch {}
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, await deflate(full));
  return hash;
}

// Reads an object back and verifies its integrity (hash must match its name).
async function readObject(hash, root) {
  const file = path.join(objectsDir(root), hash.slice(0, 2), hash.slice(2));
  const full = await inflate(await fs.readFile(file));
  const nul = full.indexOf(0);
  const [type, size] = full.subarray(0, nul).toString().split(" ");
  const content = full.subarray(nul + 1);
  if (Number(size) !== content.length) throw new Error(`Corrupt object ${hash}`);
  if (hashObject(type, content).hash !== hash) throw new Error(`Hash mismatch for ${hash}`);
  return { type, content };
}

const writeBlob = (buffer, root) => writeObject("blob", buffer, root);

// Plain code-unit comparison (NOT localeCompare, which can differ between machines and change hashes).
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

// Tree line: "<mode> <type> <hash>\t<name>\n", sorted by name so the same folder always hashes the same.
async function writeTree(entries, root) {
  const text = [...entries]
    .sort(byName)
    .map((e) => `${e.mode} ${e.type} ${e.hash}\t${e.name}\n`)
    .join("");
  return writeObject("tree", Buffer.from(text), root);
}

async function readTree(hash, root) {
  const { type, content } = await readObject(hash, root);
  if (type !== "tree") throw new Error(`${hash} is not a tree`);
  return content
    .toString()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [meta, name] = line.split("\t");
      const [mode, t, h] = meta.split(" ");
      return { mode, type: t, hash: h, name };
    });
}

// A commit points to a tree and to its parent commit => a history graph.
async function writeCommit({ tree, parent = null, author, message, timestamp }, root) {
  const lines = [`tree ${tree}`];
  if (parent) lines.push(`parent ${parent}`);
  lines.push(`author ${author}`);
  lines.push(`time ${timestamp ?? new Date().toISOString()}`);
  lines.push("", message);
  return writeObject("commit", Buffer.from(lines.join("\n")), root);
}

async function readCommit(hash, root) {
  const { type, content } = await readObject(hash, root);
  if (type !== "commit") throw new Error(`${hash} is not a commit`);
  const [head, ...msg] = content.toString().split("\n\n");
  const commit = { hash, message: msg.join("\n\n") };
  for (const line of head.split("\n")) {
    const i = line.indexOf(" ");
    commit[line.slice(0, i)] = line.slice(i + 1);
  }
  return commit;
}

module.exports = {
  REPO_DIR, objectsDir, hashObject, writeObject, readObject,
  writeBlob, writeTree, readTree, writeCommit, readCommit,
};