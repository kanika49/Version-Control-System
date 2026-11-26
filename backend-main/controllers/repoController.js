const Repository = require("../models/repoModel");
const User = require("../models/userModel");
const Issue = require("../models/issueModel");
const asyncHandler = require("../middleware/asyncHandler");
const GitObject = require("../models/objectModel");
// Public repos are visible to everyone; private ones only to their owner.
const visibleTo = (userId) =>
  userId ? { $or: [{ visibility: true }, { owner: userId }] } : { visibility: true };

const createRepository = asyncHandler(async (req, res) => {
  const { name, description, visibility } = req.body;
  // FIX: owner comes from the verified token, never from the request body
  const repo = await Repository.create({ name, description, visibility, owner: req.userId });
  await User.findByIdAndUpdate(req.userId, { $push: { repositories: repo._id } });
  res.status(201).json({ message: "Repository created!", repositoryID: repo._id });
});

const getAllRepositories = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  // FIX: only PUBLIC repos; owner populated with username only (old code leaked password hashes)
  const repos = await Repository.find({ visibility: true })
    .populate("owner", "username")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  res.json(repos);
});

const fetchRepositoryById = asyncHandler(async (req, res) => {
  const repo = await Repository.findOne({ _id: req.params.id, ...visibleTo(req.userId) })
    .populate("owner", "username")
    .populate("issues");
  // 404 (not 403) for private repos so their existence isn't revealed
  if (!repo) return res.status(404).json({ message: "Repository not found" });
  res.json(repo);
});

const fetchRepositoryByName = asyncHandler(async (req, res) => {
  const repos = await Repository.find({ name: req.params.name, ...visibleTo(req.userId) })
    .populate("owner", "username");
  res.json(repos);
});

const fetchRepositoriesForCurrentUser = asyncHandler(async (req, res) => {
  const { userID } = req.params;
  const repositories = await Repository.find({ owner: userID, ...visibleTo(req.userId) });
  // FIX: empty list is a normal 200, not a 404 (the 404 crashed the dashboard for new users)
  res.json({ message: "Repositories found!", repositories });
});

const updateRepositoryById = asyncHandler(async (req, res) => {
  const repo = req.repo; // loaded + ownership-checked by requireRepoOwner
  const { content, description } = req.body;
  if (content !== undefined) repo.content.push(content);
  if (description !== undefined) repo.description = description;
  const updated = await repo.save();
  res.json({ message: "Repository updated successfully!", repository: updated });
});

const toggleVisibilityById = asyncHandler(async (req, res) => {
  req.repo.visibility = !req.repo.visibility;
  const updated = await req.repo.save();
  res.json({ message: "Repository visibility toggled successfully!", repository: updated });
});

const deleteRepositoryById = asyncHandler(async (req, res) => {
  await Issue.deleteMany({ repository: req.repo._id });
  await GitObject.deleteMany({ repo: req.repo._id });
  await User.findByIdAndUpdate(req.repo.owner, { $pull: { repositories: req.repo._id } });
  await req.repo.deleteOne();
  res.json({ message: "Repository deleted successfully!" });
});

module.exports = {
  createRepository,
  getAllRepositories,
  fetchRepositoryById,
  fetchRepositoryByName,
  fetchRepositoriesForCurrentUser,
  updateRepositoryById,
  toggleVisibilityById,
  deleteRepositoryById,
};
