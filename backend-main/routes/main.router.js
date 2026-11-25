const express = require("express");
const mainRouter = express.Router();

mainRouter.use(require("./user.router"));
mainRouter.use(require("./repo.router"));
mainRouter.use(require("./issue.router"));

mainRouter.get("/", (req, res) => res.send("Welcome!"));
mainRouter.get("/health", (req, res) => res.json({ status: "ok" }));

module.exports = mainRouter;
