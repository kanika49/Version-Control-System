const Repository = require("../models/repoModel");
const Issue = require("../models/issueModel");
const asyncHandler = require("../middleware/asyncHandler");

// Returns the repo only if this user is allowed to see it.
async function findVisibleRepo(repoId, userId) {
  const filter = userId
    ? { _id: repoId, $or: [{ visibility: true }, { owner: userId }] }
    : { _id: repoId, visibility: true };
  return Repository.findOne(filter);
}

const createIssue = asyncHandler(async (req, res) => {
  const repo = await findVisibleRepo(req.params.repoId, req.userId);
  if (!repo) return res.status(404).json({ message: "Repository not found" });

  const { title, description } = req.body;
  const issue = await Issue.create({ title, description, repository: repo._id, author: req.userId });
  await Repository.findByIdAndUpdate(repo._id, { $push: { issues: issue._id } });
  res.status(201).json(issue);
});

const getAllIssues = asyncHandler(async (req, res) => {
  const repo = await findVisibleRepo(req.params.repoId, req.userId);
  if (!repo) return res.status(404).json({ message: "Repository not found" });
  const issues = await Issue.find({ repository: repo._id }).sort({ createdAt: -1 }); // FIX: now awaited
  res.json(issues);
});

const getIssueById = asyncHandler(async (req, res) => {
  const issue = await Issue.findById(req.params.id);
  if (!issue || !(await findVisibleRepo(issue.repository, req.userId))) {
    return res.status(404).json({ message: "Issue not found!" });
  }
  res.json(issue);
});

// Only the issue's author or the repo owner may change or delete it.
async function loadIssueForEdit(req, res) {
  const issue = await Issue.findById(req.params.id);
  if (!issue) {
    res.status(404).json({ message: "Issue not found!" });
    return null;
  }
  const repo = await Repository.findById(issue.repository);
  const allowed = String(issue.author) === req.userId || (repo && String(repo.owner) === req.userId);
  if (!allowed) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return issue;
}

const updateIssueById = asyncHandler(async (req, res) => {
  const issue = await loadIssueForEdit(req, res);
  if (!issue) return;
  const { title, description, status } = req.body;
  if (title !== undefined) issue.title = title;
  if (description !== undefined) issue.description = description;
  if (status !== undefined) issue.status = status;
  await issue.save();
  res.json({ message: "Issue updated", issue }); // FIX: old code passed 2 args to res.json
});

const deleteIssueById = asyncHandler(async (req, res) => {
  const issue = await loadIssueForEdit(req, res);
  if (!issue) return;
  await Repository.findByIdAndUpdate(issue.repository, { $pull: { issues: issue._id } });
  await issue.deleteOne(); // FIX: old code never awaited, so nothing was actually deleted
  res.json({ message: "Issue deleted" });
});

module.exports = { createIssue, getAllIssues, getIssueById, updateIssueById, deleteIssueById };