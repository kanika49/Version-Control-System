const fs = require("fs").promises;
const path = require("path");
const o = require("../vcs/objects");
const r = require("../vcs/repo");
const w = require("../vcs/workdir");
const { diffLines, toHunks, splitLines } = require("../vcs/diff");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const clean = (s) => s.replace(/\r$/, ""); // show Windows line endings without ^M

async function blobContent(root, hash) {
  return hash ? (await o.readObject(hash, root)).content : Buffer.alloc(0);
}

// `diff` compares working folder vs index; `diff --staged` compares index vs last commit.
async function diffRepo({ staged = false } = {}) {
  const root = await r.requireRepoRoot();
  const index = await r.readIndex(root);
  const oldMap = staged ? await w.headFiles(root) : index;
  const paths = [...new Set([...Object.keys(oldMap), ...(staged ? Object.keys(index) : [])])].sort();

  let shown = 0;
  for (const p of paths) {
    const oldHash = oldMap[p];
    const newHash = staged ? index[p] : await w.hashWorkingFile(root, p);
    if (oldHash === newHash || (newHash === null && oldHash === undefined)) continue;

    const oldBuf = await blobContent(root, oldHash);
    const newBuf = staged ? await blobContent(root, newHash) : newHash ? await fs.readFile(path.join(root, p)) : Buffer.alloc(0);

    console.log(paint(1, `diff --kgit a/${p} b/${p}`));
    if (oldHash === undefined) console.log("new file");
    if (!newHash) console.log("deleted file");
    shown++;

    if (oldBuf.includes(0) || newBuf.includes(0)) {
      console.log("Binary files differ");
      continue;
    }
    const ops = diffLines(splitLines(oldBuf.toString()), splitLines(newBuf.toString()));
    for (const h of toHunks(ops)) {
      console.log(paint(36, h.header));
      for (const l of h.lines) {
        if (l.type === "ins") console.log(paint(32, `+${clean(l.line)}`));
        else if (l.type === "del") console.log(paint(31, `-${clean(l.line)}`));
        else console.log(` ${clean(l.line)}`);
      }
    }
  }
  if (shown === 0) console.log("No differences.");
}

module.exports = { diffRepo };