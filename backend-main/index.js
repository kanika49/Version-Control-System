require("dotenv").config(); // must run BEFORE other files read process.env
const mongoose = require("mongoose");
const app = require("./app");

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

const { initRepo } = require("./controllers/init");
const { addRepo } = require("./controllers/add");
const { commitRepo } = require("./controllers/commit");
const { pushRepo } = require("./controllers/push");
const { pullRepo } = require("./controllers/pull");
const { revertRepo } = require("./controllers/revert");

yargs(hideBin(process.argv))
  .command("start", "Starts a new server", {}, startServer)
  .command("init", "Initialise a new repository", {}, initRepo)
  .command(
    "add <file>",
    "Add a file to the repository",
    (yargs) => {
      yargs.positional("file", {
        describe: "File to add to the staging area",
        type: "string",
      });
    },
    (argv) => {
      addRepo(argv.file);
    }
  )
  .command(
    "commit <message>",
    "Commit the staged files",
    (yargs) => {
      yargs.positional("message", {
        describe: "Commit message",
        type: "string",
      });
    },
    (argv) => {
      commitRepo(argv.message);
    }
  )
  .command("push", "Push commits to S3", {}, pushRepo)
  .command("pull", "Pull commits from S3", {}, pullRepo)
  .command(
    "revert <commitID>",
    "Revert to a specific commit",
    (yargs) => {
      yargs.positional("commitID", {
        describe: "Comit ID to revert to",
        type: "string",
      });
    },
    (argv) => {
      revertRepo(argv.commitID);
    }
  )
  .demandCommand(1, "You need at least one command")
  .help().argv;

function startServer() {
  // Fail fast with a clear message instead of crashing later.
  for (const key of ["MONGODB_URI", "JWT_SECRET_KEY"]) {
    if (!process.env[key]) {
      console.error(`Missing ${key} in .env (see .env.example)`);
      process.exit(1);
    }
  }
  const port = process.env.PORT || 3002; // FIX: default matches what the frontend calls

  // Connect to the database first, then start accepting requests.
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