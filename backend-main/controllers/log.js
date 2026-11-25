const o = require("../vcs/objects");
const r = require("../vcs/repo");

// Show every commit reachable from the branch tip. Once branches have been merged the history is a graph,
// so we visit all parents and print children before their parents (newest first).
async function logRepo() {
  const root = await r.requireRepoRoot();
  const tip = await r.readRef(root, await r.currentBranch(root));
  if (!tip) {
    console.log("No commits yet.");
    return;
  }

  const commits = new Map();
  const stack = [tip];
  while (stack.length) {
    const h = stack.pop();
    if (commits.has(h)) continue;
    const c = await o.readCommit(h, root);
    commits.set(h, c);
    stack.push(...c.parents);
  }

  // children[h] = how many unprinted commits still point at h as their parent
  const waiting = new Map([...commits.keys()].map((h) => [h, 0]));
  for (const c of commits.values()) for (const p of c.parents) waiting.set(p, waiting.get(p) + 1);

  const ready = [tip];
  while (ready.length) {
    ready.sort((a, b) => (commits.get(a).time < commits.get(b).time ? -1 : 1)); // newest last, popped first
    const c = commits.get(ready.pop());
    console.log(`commit ${c.hash}`);
    if (c.parents.length > 1) console.log(`Merge:  ${c.parents.map((p) => p.slice(0, 8)).join(" ")}`);
    console.log(`Author: ${c.author}`);
    console.log(`Date:   ${c.time}`);
    console.log(`\n    ${c.message}\n`);
    for (const p of c.parents) {
      waiting.set(p, waiting.get(p) - 1);
      if (waiting.get(p) === 0) ready.push(p);
    }
  }
}

module.exports = { logRepo };