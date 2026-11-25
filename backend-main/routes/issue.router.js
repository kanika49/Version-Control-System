const express = require("express");
const c = require("../controllers/issueController");
const { authMiddleware, optionalAuth } = require("../middleware/authMiddleware");
const { validate, validateObjectIds } = require("../middleware/validate");

const router = express.Router();

// FIX: the repo id is now in the URL (the old routes had no :id but the controllers read req.params.id)
router.post("/repo/:repoId/issue", authMiddleware, validateObjectIds("repoId"), validate("createIssue"), c.createIssue);
router.get("/repo/:repoId/issues", optionalAuth, validateObjectIds("repoId"), c.getAllIssues);
router.get("/issue/:id", optionalAuth, validateObjectIds("id"), c.getIssueById);
router.put("/issue/:id", authMiddleware, validateObjectIds("id"), validate("updateIssue"), c.updateIssueById);
router.delete("/issue/:id", authMiddleware, validateObjectIds("id"), c.deleteIssueById);

module.exports = router;
