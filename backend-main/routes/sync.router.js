const express = require("express");
const c = require("../controllers/syncController");
const { authMiddleware, optionalAuth } = require("../middleware/authMiddleware");
const { requireRepoOwner } = require("../middleware/authorizeMiddleware");
const { validateBody } = require("../middleware/validateSync");

const router = express.Router();

// Only handle real repository ids; anything else (e.g. /repo/name/foo) falls through to the other routers.
router.param("id", (req, res, next, id) => (/^[0-9a-fA-F]{24}$/.test(id) ? next() : next("route")));

// These routes accept bigger request bodies than the rest of the API, so they parse JSON themselves.
// (This router is mounted BEFORE the global 100 KB parser in app.js.)
const json = (limit) => express.json({ limit });

// Reading: public repos for everyone, private repos for the owner only.
router.get("/repo/:id/refs", optionalAuth, c.getRefs);
router.get("/repo/:id/commits", optionalAuth, c.getCommits);
router.get("/repo/:id/tree", optionalAuth, c.getTree);
router.get("/repo/:id/blob", optionalAuth, c.getBlob);
router.post("/repo/:id/objects/get", optionalAuth, json("1mb"), validateBody("get"), c.getObjects);

// Writing: the repository owner only. Login and ownership are checked BEFORE the body is parsed.
router.post("/repo/:id/objects/missing", authMiddleware, requireRepoOwner("id"), json("2mb"), validateBody("missing"), c.missing);
router.put("/repo/:id/objects", authMiddleware, requireRepoOwner("id"), json("8mb"), validateBody("put"), c.putObjects);
router.post("/repo/:id/refs/update", authMiddleware, requireRepoOwner("id"), json("10kb"), validateBody("refUpdate"), c.updateRef);

module.exports = router;