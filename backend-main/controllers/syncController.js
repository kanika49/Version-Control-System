const Repository = require("../models/repoModel");
const asyncHandler = require("../middleware/asyncHandler");
const git = require("../services/gitService");

// A repository the current visitor is allowed to read (private ones: owner only, others see 404).
async function readableRepo(req, res) {
  const filter = req.userId
    ? { _id: req.params.id, $or: [{ visibility: true }, { owner: req.userId }] }
    : { _id: req.params.id, visibility: true };
  const repo = await Repository.findOne(filter);
  if (!repo) res.status(404).json({ message: "Repository not found" });
  return repo;
}

// ---------- used by `kgit push` / `kgit pull` ----------

const getRefs = asyncHandler(async (req, res) => {
  const repo = await readableRepo(req, res);
  if (!repo) return;
  res.json({ branches: repo.branches.map((b) => ({ name: b.name, hash: b.hash })) });
});

const missing = asyncHandler(async (req, res) => {
  res.json({ missing: await git.missingHashes(req.repo._id, req.body.hashes) });
});

const putObjects = asyncHandler(async (req, res) => {
  const items = req.body.objects.map((o) => ({ hash: o.hash, data: Buffer.from(o.data, "base64") }));
  res.json({ stored: await git.storeObjects(req.repo._id, items) });
});

const updateRef = asyncHandler(async (req, res) => {
  const { branch, old, new: newHash } = req.body;
  const current = req.repo.branches.find((b) => b.name === branch)?.hash ?? null;
  const stale = { message: "The remote branch changed meanwhile. Pull, then push again.", reason: "stale" };

  if (current !== old) return res.status(409).json(stale);
  await git.verifyPush(req.repo._id, current, newHash);
  if (!(await git.updateBranch(req.repo._id, branch, current, newHash))) return res.status(409).json(stale);
  res.json({ ok: true });
});

const getObjects = asyncHandler(async (req, res) => {
  const repo = await readableRepo(req, res);
  if (!repo) return;
  const { objects, pending, missing: gone } = await git.fetchObjects(repo._id, req.body.hashes, 6 * 1024 * 1024);
  res.json({
    objects: objects.map((o) => ({ hash: o.hash, data: o.data.toString("base64") })),
    pending,
    missing: gone,
  });
});

// ---------- used by the website ----------

const getCommits = asyncHandler(async (req, res) => {
  const repo = await readableRepo(req, res);
  if (!repo) return;
  if (repo.branches.length === 0) return res.json([]);
  const tip = await git.resolveRef(repo, req.query.branch);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);
  res.json(await git.listCommits(repo._id, tip, limit));
});

const getTree = asyncHandler(async (req, res) => {
  const repo = await readableRepo(req, res);
  if (!repo) return;
  const commit = await git.resolveRef(repo, req.query.ref);
  res.json({ ref: commit, path: req.query.path || "", entries: await git.readTreeAt(repo._id, commit, req.query.path) });
});

const getBlob = asyncHandler(async (req, res) => {
  const repo = await readableRepo(req, res);
  if (!repo) return;
  const commit = await git.resolveRef(repo, req.query.ref);
  res.json({ ref: commit, path: req.query.path || "", ...(await git.readBlobAt(repo._id, commit, req.query.path)) });
});

module.exports = { getRefs, missing, putObjects, updateRef, getObjects, getCommits, getTree, getBlob };