// Merge helpers: finding the common ancestor, merging two snapshots, and remembering an unfinished merge.

const fs = require("fs").promises;
const path = require("path");
const o = require("./objects");
const r = require("./repo");
const { merge3 } = require("./merge3");
const { splitLines } = require("./diff");

// ---------- history graph ----------

// Every commit reachable from `hash` (including itself), following ALL parents.
async function ancestors(root, hash, memo = new Map()) {
  if (memo.has(hash)) return memo.get(hash);
  const seen = new Set([hash]);
  const stack = [hash];
  while (stack.length) {
    const c = await o.readCommit(stack.pop(), root);
    for (const p of c.parents) {
      if (!seen.has(p)) {
        seen.add(p);
        stack.push(p);
      }
    }
  }
  memo.set(hash, seen);
  return seen;
}

// The "lowest common ancestor": a commit both branches share that is not hidden behind another shared commit.
async function findMergeBase(root, a, b) {
  const memo = new Map();
  const ancA = await ancestors(root, a, memo);
  const ancB = await ancestors(root, b, memo);
  const common = [...ancA].filter((h) => ancB.has(h));
  if (common.length === 0) return null; // unrelated histories

  const hidden = new Set(); // common commits that are ancestors of another common commit
  for (const c of common) {
    for (const h of await ancestors(root, c, memo)) if (h !== c) hidden.add(h);
  }
  const best = common.filter((h) => !hidden.has(h));
  if (best.length === 1) return best[0];
  // Rare "criss-cross" history: several candidates, so take the most recent one.
  const timed = [];
  for (const h of best) timed.push([h, (await o.readCommit(h, root)).time]);
  return timed.sort((x, y) => (x[1] < y[1] ? 1 : -1))[0][0];
}

// ---------- merging two snapshots ----------
// base / ours / theirs are { path: blobHash } maps. Returns the merged map and the list of conflicts.
async function mergeFiles(root, base, ours, theirs, oursName, theirsName) {
  const files = {};
  const conflicts = [];
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);

  for (const p of [...paths].sort()) {
    const b = base[p];
    const a = ours[p];
    const t = theirs[p];

    if (a === t) { if (a !== undefined) files[p] = a; continue; }   // same on both sides
    if (a === b) { if (t !== undefined) files[p] = t; continue; }   // only theirs changed it
    if (t === b) { if (a !== undefined) files[p] = a; continue; }   // only ours changed it

    // Both sides changed this file, in different ways.
    if (a === undefined || t === undefined) {
      files[p] = a === undefined ? t : a; // one side deleted it, the other edited it: keep the edit
      conflicts.push({ path: p, kind: "modify/delete" });
      continue;
    }
    const read = async (h) => (h ? (await o.readObject(h, root)).content : Buffer.alloc(0));
    const [bb, ab, tb] = [await read(b), await read(a), await read(t)];
    if (bb.includes(0) || ab.includes(0) || tb.includes(0)) {
      files[p] = a; // binary files cannot be merged line by line
      conflicts.push({ path: p, kind: "binary" });
      continue;
    }
    const res = merge3(splitLines(bb.toString()), splitLines(ab.toString()), splitLines(tb.toString()), oursName, theirsName);
    const text = res.lines.length ? res.lines.join("\n") + "\n" : "";
    files[p] = await o.writeBlob(Buffer.from(text), root);
    if (res.conflict) conflicts.push({ path: p, kind: "content" });
  }
  return { files, conflicts };
}

// Make the working folder match `to`, given that it currently matches `from`.
async function applyMap(root, from, to) {
  for (const p of Object.keys(from)) {
    if (to[p] === undefined) await fs.rm(path.join(root, p), { force: true });
  }
  for (const [p, hash] of Object.entries(to)) {
    const file = path.join(root, p);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, (await o.readObject(hash, root)).content);
  }
}

// ---------- unfinished merge state (survives between commands) ----------
async function readMergeState(root) {
  let head;
  try {
    head = (await fs.readFile(r.kgitPath(root, "MERGE_HEAD"), "utf8")).trim();
  } catch {
    return null;
  }
  let conflicts = [];
  try {
    conflicts = JSON.parse(await fs.readFile(r.kgitPath(root, "MERGE_CONFLICTS"), "utf8"));
  } catch {}
  return { head, conflicts };
}

async function writeMergeState(root, head, conflicts) {
  await fs.writeFile(r.kgitPath(root, "MERGE_HEAD"), head + "\n");
  await fs.writeFile(r.kgitPath(root, "MERGE_CONFLICTS"), JSON.stringify(conflicts));
}

async function clearMergeState(root) {
  await fs.rm(r.kgitPath(root, "MERGE_HEAD"), { force: true });
  await fs.rm(r.kgitPath(root, "MERGE_CONFLICTS"), { force: true });
}

const HAS_MARKERS = /^(<<<<<<< |>>>>>>> )/m;

// Called by `add`: a conflicted file counts as resolved once it is staged AND has no conflict markers left.
// Returns the files that still contain markers.
async function markResolved(root, paths) {
  const state = await readMergeState(root);
  if (!state || state.conflicts.length === 0) return [];
  const stillMarked = [];
  for (const p of paths) {
    if (!state.conflicts.includes(p)) continue;
    let text = "";
    try {
      text = await fs.readFile(path.join(root, p), "utf8");
    } catch {} // a deleted file counts as resolved
    if (HAS_MARKERS.test(text)) stillMarked.push(p);
    else state.conflicts = state.conflicts.filter((c) => c !== p);
  }
  await writeMergeState(root, state.head, state.conflicts);
  return stillMarked;
}

module.exports = {
  ancestors, findMergeBase, mergeFiles, applyMap,
  readMergeState, writeMergeState, clearMergeState, markResolved,
};