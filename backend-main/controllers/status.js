const r = require("../vcs/repo");
const w = require("../vcs/workdir");

async function statusRepo() {
  const root = await r.requireRepoRoot();
  const branch = await r.currentBranch(root);
  const s = await w.computeStatus(root);

  console.log(`On branch ${branch}`);
  if (!(await r.readRef(root, branch))) console.log("No commits yet");

  const staged = [
    ...s.staged.new.map((p) => `        new file:   ${p}`),
    ...s.staged.modified.map((p) => `        modified:   ${p}`),
    ...s.staged.deleted.map((p) => `        deleted:    ${p}`),
  ];
  const unstaged = [
    ...s.unstaged.modified.map((p) => `        modified:   ${p}`),
    ...s.unstaged.deleted.map((p) => `        deleted:    ${p}`),
  ];

  if (staged.length) console.log("\nChanges staged for commit:\n" + staged.join("\n"));
  if (unstaged.length) console.log("\nChanges not staged for commit:\n" + unstaged.join("\n"));
  if (s.untracked.length) console.log("\nUntracked files:\n" + s.untracked.map((p) => `        ${p}`).join("\n"));
  if (!staged.length && !unstaged.length && !s.untracked.length) console.log("\nNothing to commit, working tree clean");
}

module.exports = { statusRepo };