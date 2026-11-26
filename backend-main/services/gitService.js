// Server-side git logic: store objects, check pushes, move branches, and read history/files back.
// Everything here treats incoming data as untrusted.

const GitObject = require("../models/objectModel");
const Repository = require("../models/repoModel");
const codec = require("../vcs/codec");

const QUOTA_BYTES = (Number(process.env.REPO_QUOTA_MB) || 50) * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024; // largest file we send to the browser

const httpError = (status, message, reason) => Object.assign(new Error(message), { status, reason });
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ---------- objects ----------

// Which of these hashes does the server NOT have yet? (This is what makes pushes incremental.)
async function missingHashes(repoId, hashes) {
  const have = new Set();
  for (const part of chunk(hashes, 1000)) {
    const docs = await GitObject.find({ repo: repoId, hash: { $in: part } }).select("hash");
    docs.forEach((d) => have.add(d.hash));
  }
  return hashes.filter((h) => !have.has(h));
}

async function usedBytes(repoId) {
  const [row] = await GitObject.aggregate([
    { $match: { repo: new GitObject.base.Types.ObjectId(String(repoId)) } },
    { $group: { _id: null, total: { $sum: "$size" } } },
  ]);
  return row ? row.total : 0;
}

// Validate every uploaded object (hash, size, structure, safe names), then store the new ones.
async function storeObjects(repoId, items) {
  let incoming = 0;
  for (const { hash, data } of items) {
    if (!codec.HASH_RE.test(hash)) throw httpError(400, "Invalid object hash");
    const { type, content } = codec.decodeObject(data, hash); // throws on tampering / zip bombs
    if (type === "tree") codec.validateTreeEntries(codec.parseTreeContent(content));
    if (type === "commit") codec.parseCommitContent(content, hash);
    incoming += data.length;
  }
  if ((await usedBytes(repoId)) + incoming > QUOTA_BYTES) {
    throw httpError(413, `Repository storage limit reached (${Math.round(QUOTA_BYTES / 1024 / 1024)} MB)`);
  }
  await GitObject.bulkWrite(
    items.map(({ hash, data }) => ({
      updateOne: {
        filter: { repo: repoId, hash },
        update: { $setOnInsert: { repo: repoId, hash, data, size: data.length } },
        upsert: true, // already there? leave it alone
      },
    })),
    { ordered: false }
  );
  return items.length;
}

// Load and decode many objects at once: Map(hash -> { type, content }).
async function loadMany(repoId, hashes) {
  const out = new Map();
  for (const part of chunk([...new Set(hashes)], 500)) {
    // (not .lean(): lean() hands back Mongo's Binary wrapper instead of a Buffer)
    const docs = await GitObject.find({ repo: repoId, hash: { $in: part } });
    for (const d of docs) out.set(d.hash, codec.decodeObject(d.data, d.hash));
  }
  return out;
}

// Objects for a pull. Stops at `maxBytes` and reports the rest as `pending` so the client asks again.
async function fetchObjects(repoId, hashes, maxBytes) {
  const docs = await GitObject.find({ repo: repoId, hash: { $in: hashes } });
  const byHash = new Map(docs.map((d) => [d.hash, d]));
  const objects = [];
  const pending = [];
  const missing = [];
  let total = 0;
  for (const h of hashes) {
    const d = byHash.get(h);
    if (!d) missing.push(h);
    else if (objects.length > 0 && total + d.size > maxBytes) pending.push(h);
    else {
      objects.push({ hash: h, data: d.data });
      total += d.size;
    }
  }
  return { objects, pending, missing };
}

// ---------- pushing ----------

// Before moving a branch to newTip, prove that:
//  1. everything newTip needs (commits, trees, blobs) is really stored, and
//  2. the old tip is an ancestor of newTip (a fast-forward: nobody's work gets overwritten).
async function verifyPush(repoId, oldTip, newTip) {
  if (oldTip === newTip) return;
  let foundOld = oldTip === null;
  const seenCommits = new Set();
  const seenTrees = new Set();
  const blobs = new Set();
  let commitQ = [newTip];
  let treeQ = [];

  while (commitQ.length) {
    const batch = commitQ.splice(0, 200).filter((h) => !seenCommits.has(h));
    batch.forEach((h) => seenCommits.add(h));
    const objs = await loadMany(repoId, batch);
    for (const h of batch) {
      const o = objs.get(h);
      if (!o) throw httpError(409, `Missing object ${h.slice(0, 12)}: upload it first`, "missing-objects");
      if (o.type !== "commit") throw httpError(409, "The branch must point to a commit", "bad-object");
      const c = codec.parseCommitContent(o.content, h);
      for (const p of c.parents) {
        if (p === oldTip) foundOld = true; // the old tip is already complete on the server: no need to go deeper
        else commitQ.push(p);
      }
      if (!seenTrees.has(c.tree)) {
        seenTrees.add(c.tree);
        treeQ.push(c.tree);
      }
    }
  }
  while (treeQ.length) {
    const batch = treeQ.splice(0, 200);
    const objs = await loadMany(repoId, batch);
    for (const h of batch) {
      const o = objs.get(h);
      if (!o) throw httpError(409, `Missing object ${h.slice(0, 12)}: upload it first`, "missing-objects");
      if (o.type !== "tree") throw httpError(409, "Expected a tree object", "bad-object");
      const entries = codec.parseTreeContent(o.content);
      codec.validateTreeEntries(entries);
      for (const e of entries) {
        if (e.type === "tree") {
          if (!seenTrees.has(e.hash)) {
            seenTrees.add(e.hash);
            treeQ.push(e.hash);
          }
        } else blobs.add(e.hash);
      }
    }
  }
  if ((await missingHashes(repoId, [...blobs])).length) {
    throw httpError(409, "Some file contents are missing: upload them first", "missing-objects");
  }
  if (!foundOld) {
    throw httpError(409, "Rejected: the remote branch has commits you don't have. Pull first, then push.", "non-fast-forward");
  }
}

// Move (or create) a branch pointer, but only if nobody else moved it meanwhile (compare-and-swap).
async function updateBranch(repoId, name, oldHash, newHash) {
  const res =
    oldHash === null
      ? await Repository.updateOne({ _id: repoId, "branches.name": { $ne: name } }, { $push: { branches: { name, hash: newHash } } })
      : await Repository.updateOne(
          { _id: repoId, branches: { $elemMatch: { name, hash: oldHash } } },
          { $set: { "branches.$.hash": newHash } }
        );
  return res.modifiedCount === 1;
}

// ---------- reading (for the website) ----------

const defaultBranch = (repo) =>
  (repo.branches.find((b) => b.name === "main") || repo.branches[0] || {}).name;

// "main" / any branch name / a full commit hash  ->  commit hash
async function resolveRef(repo, ref) {
  const name = ref || defaultBranch(repo);
  if (!name) throw httpError(404, "This repository is empty");
  const branch = repo.branches.find((b) => b.name === name);
  if (branch) return branch.hash;
  if (codec.HASH_RE.test(name)) {
    const o = (await loadMany(repo._id, [name])).get(name);
    if (o && o.type === "commit") return name;
  }
  throw httpError(404, `Unknown branch or commit: ${name}`);
}

async function listCommits(repoId, tip, limit = 30) {
  const commits = new Map();
  let frontier = [tip];
  while (frontier.length && commits.size < 1000) {
    const batch = frontier.splice(0, 200).filter((h) => !commits.has(h));
    const objs = await loadMany(repoId, batch);
    for (const h of batch) {
      const o = objs.get(h);
      if (!o || o.type !== "commit") continue;
      const c = codec.parseCommitContent(o.content, h);
      commits.set(h, c);
      frontier.push(...c.parents);
    }
  }
  return [...commits.values()]
    .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : a.hash < b.hash ? -1 : 1))
    .slice(0, limit)
    .map((c) => ({ hash: c.hash, message: c.message, author: c.author, time: c.time, parents: c.parents }));
}

function splitPath(p) {
  const parts = String(p || "").split("/").filter(Boolean);
  if (parts.some((x) => x === "." || x === "..")) throw httpError(400, "Invalid path");
  return parts;
}

// Walk from a commit's root folder down a path. Returns the object found there.
async function walk(repoId, commitHash, pathStr) {
  const commit = codec.parseCommitContent((await loadMany(repoId, [commitHash])).get(commitHash).content, commitHash);
  let current = { type: "tree", hash: commit.tree };
  for (const name of splitPath(pathStr)) {
    if (current.type !== "tree") throw httpError(404, "Path not found");
    const o = (await loadMany(repoId, [current.hash])).get(current.hash);
    const entry = codec.parseTreeContent(o.content).find((e) => e.name === name);
    if (!entry) throw httpError(404, "Path not found");
    current = { type: entry.type, hash: entry.hash };
  }
  return current;
}

async function readTreeAt(repoId, commitHash, pathStr) {
  const node = await walk(repoId, commitHash, pathStr);
  if (node.type !== "tree") throw httpError(404, "Not a folder");
  const o = (await loadMany(repoId, [node.hash])).get(node.hash);
  return codec
    .parseTreeContent(o.content)
    .map((e) => ({ name: e.name, type: e.type }))
    .sort((a, b) => (a.type === b.type ? (a.name < b.name ? -1 : 1) : a.type === "tree" ? -1 : 1)); // folders first
}

async function readBlobAt(repoId, commitHash, pathStr) {
  const node = await walk(repoId, commitHash, pathStr);
  if (node.type !== "blob") throw httpError(404, "Not a file");
  const o = (await loadMany(repoId, [node.hash])).get(node.hash);
  const binary = o.content.subarray(0, 8000).includes(0);
  const truncated = o.content.length > MAX_TEXT_BYTES;
  return {
    size: o.content.length,
    binary,
    truncated,
    content: binary ? null : o.content.subarray(0, MAX_TEXT_BYTES).toString("utf8"),
  };
}

module.exports = {
  httpError, missingHashes, storeObjects, fetchObjects, verifyPush, updateBranch,
  defaultBranch, resolveRef, listCommits, readTreeAt, readBlobAt,
};