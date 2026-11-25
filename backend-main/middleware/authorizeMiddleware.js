const Repository = require("../models/repoModel");
const asyncHandler = require("./asyncHandler");

// The logged-in user may only act on their own account: /something/:id must equal their id.
function requireSelf(req, res, next) {
  if (req.params.id !== req.userId) return res.status(403).json({ message: "Forbidden" });
  next();
}

// The logged-in user must own the repository in req.params[param]. Loads it into req.repo.
const requireRepoOwner = (param = "id") =>
  asyncHandler(async (req, res, next) => {
    const repo = await Repository.findById(req.params[param]);
    if (!repo) return res.status(404).json({ message: "Repository not found" });
    if (String(repo.owner) !== req.userId) return res.status(403).json({ message: "Forbidden" });
    req.repo = repo;
    next();
  });

module.exports = { requireSelf, requireRepoOwner };