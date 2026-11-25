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
  .command(
    "restore <commit>",
    "Restore files from a commit (full or short hash, or HEAD)",
    (y) => y.positional("commit", { describe: "Commit id", type: "string" }),
    run((argv) => restoreRepo(argv.commit))
  )
  // push/pull still use the old storage layout; they are rebuilt in Step 4.
  .command("push", "Push commits to S3 (being rebuilt)", {}, run(() => require("./controllers/push").pushRepo()))
  .command("pull", "Pull commits from S3 (being rebuilt)", {}, run(() => require("./controllers/pull").pullRepo()))
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