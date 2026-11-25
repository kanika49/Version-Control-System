const express = require("express");
const c = require("../controllers/repoController");
const { authMiddleware, optionalAuth } = require("../middleware/authMiddleware");
const { requireRepoOwner } = require("../middleware/authorizeMiddleware");
const { validate, validateObjectIds } = require("../middleware/validate");

const router = express.Router();

router.post("/repo/create", authMiddleware, validate("createRepo"), c.createRepository);
router.get("/repo/all", c.getAllRepositories);
router.get("/repo/name/:name", optionalAuth, c.fetchRepositoryByName);
router.get("/repo/user/:userID", optionalAuth, validateObjectIds("userID"), c.fetchRepositoriesForCurrentUser);
router.get("/repo/:id", optionalAuth, validateObjectIds("id"), c.fetchRepositoryById);
router.put("/repo/update/:id", authMiddleware, validateObjectIds("id"), requireRepoOwner("id"), validate("updateRepo"), c.updateRepositoryById);
router.patch("/repo/toggle/:id", authMiddleware, validateObjectIds("id"), requireRepoOwner("id"), c.toggleVisibilityById);
router.delete("/repo/delete/:id", authMiddleware, validateObjectIds("id"), requireRepoOwner("id"), c.deleteRepositoryById);

module.exports = router;
