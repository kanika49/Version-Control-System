#!/usr/bin/env node
const path = require("path");
// Load .env from the backend folder even when the CLI is run from another folder.
require("dotenv").config({ path: path.join(__dirname, ".env") });

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

const { initRepo } = require("./controllers/init");
const { addRepo } = require("./controllers/add");
const { commitRepo } = require("./controllers/commit");
const { logRepo } = require("./controllers/log");
const { restoreRepo } = require("./controllers/restore");
const { statusRepo } = require("./controllers/status");
const { diffRepo } = require("./controllers/diff");
const { branchRepo } = require("./controllers/branch");
const { checkoutRepo } = require("./controllers/checkout");
const { mergeRepo } = require("./controllers/merge");
const { loginCmd, logoutCmd } = require("./controllers/auth");
const { remoteCmd } = require("./controllers/setRemote");
const { pushRepo } = require("./controllers/push");
const { pullRepo } = require("./controllers/pull");
const { cloneRepo } = require("./controllers/clone");

// Runs a command and prints a clean message (not a stack trace) if it fails.
const run = (fn) => async (argv) => {
  try {
    await fn(argv);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
};

yargs(hideBin(process.argv))
  .scriptName("kgit")
  .command("start", "Start the API server", {}, startServer)
  .command("init", "Create an empty repository here", {}, run(() => initRepo()))
  .command(
    "add <path>",
    "Stage a file or a whole folder (use . for everything)",
    (y) => y.positional("path", { describe: "File or folder to stage", type: "string" }),
    run((argv) => addRepo(argv.path))
  )
  .command(
    "commit <message>",
    "Save a snapshot of the staged files",
    (y) => y.positional("message", { describe: "Commit message (use quotes)", type: "string" }),
    run((argv) => commitRepo(argv.message))
  )
  .command("log", "Show commit history", {}, run(() => logRepo()))
  .command("status", "Show staged, unstaged and untracked files", {}, run(() => statusRepo()))
  .command(
    "diff",
    "Show line changes (working folder vs staged; use --staged for staged vs last commit)",
    (y) => y.option("staged", { alias: "cached", type: "boolean", default: false }),
    run((argv) => diffRepo({ staged: argv.staged }))
  )
  .command(
    "branch [name]",
    "List branches, or create one at the current commit",
    (y) => y.positional("name", { describe: "New branch name", type: "string" }),
    run((argv) => branchRepo(argv.name))
  )
  .command(
    "checkout <name>",
    "Switch to a branch (use -b to create it first)",
    (y) =>
      y
        .positional("name", { describe: "Branch name", type: "string" })
        .option("b", { alias: "create", type: "boolean", default: false, describe: "Create the branch" }),
    run((argv) => checkoutRepo(argv.name, { create: argv.b }))
  )
  .command(
    "merge [branch]",
    "Merge another branch into the current one (use --abort to cancel a merge with conflicts)",
    (y) =>
      y
        .positional("branch", { describe: "Branch to merge in", type: "string" })
        .option("abort", { type: "boolean", default: false, describe: "Cancel an unfinished merge" }),
    run((argv) => mergeRepo(argv.branch, { abort: argv.abort }))
  )
  .command(
    "restore <commit>",
    "Restore files from a commit (full or short hash, or HEAD)",
    (y) => y.positional("commit", { describe: "Commit id", type: "string" }),
    run((argv) => restoreRepo(argv.commit))
  )
  .command(
    "login",
    "Log in to the server (needed for push)",
    (y) => y.option("server", { type: "string", describe: "Server address, e.g. http://localhost:3002" }),
    run((argv) => loginCmd({ server: argv.server }))
  )
  .command("logout", "Forget your saved login", {}, run(() => logoutCmd()))
  .command(
    "remote <repoId>",
    "Link this folder to a repository on the website",
    (y) => y.positional("repoId", { describe: "Repository id from the repository page", type: "string" }),
    run((argv) => remoteCmd(argv.repoId))
  )
  .command("push", "Upload the current branch to the server", {}, run(() => pushRepo()))
  .command("pull", "Download the remote branch and merge it", {}, run(() => pullRepo()))
  .command(
    "clone <repoId> [folder]",
    "Copy a repository from the server into a new folder",
    (y) =>
      y
        .positional("repoId", { describe: "Repository id from the repository page", type: "string" })
        .positional("folder", { describe: "Folder to create", type: "string" }),
    run((argv) => cloneRepo(argv.repoId, argv.folder))
  )
  .demandCommand(1, "You need at least one command")
  .help().argv;

function startServer() {
  // Loaded only here so the CLI stays fast and does not need the database settings.
  const mongoose = require("mongoose");
  const app = require("./app");

  for (const key of ["MONGODB_URI", "JWT_SECRET_KEY"]) {
    if (!process.env[key]) {
      console.error(`Missing ${key} in .env (see .env.example)`);
      process.exit(1);
    }
  }
  const port = process.env.PORT || 3002;

  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log("MongoDB connected!");
      app.listen(port, () => console.log(`Server is running on PORT ${port}`));
    })
    .catch((err) => {
      console.error("Unable to connect : ", err.message);
      process.exit(1);
    });
}