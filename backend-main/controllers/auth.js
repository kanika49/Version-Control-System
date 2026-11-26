const rem = require("../vcs/remote");
const { ask, askHidden } = require("../vcs/prompt");

async function loginCmd({ server } = {}) {
  const url = (server || (await rem.serverUrl())).replace(/\/+$/, "");
  const email = process.env.KGIT_EMAIL || (await ask("Email: "));
  const password = process.env.KGIT_PASSWORD || (await askHidden("Password: "));
  const res = await rem.call("POST", url, "/login", { body: { email, password }, authFailMessage: "Wrong email or password." });
  await rem.writeGlobal({ ...(await rem.readGlobal()), server: url, token: res.token, userId: res.userId });
  console.log(`Logged in to ${url} (your session lasts 1 hour).`);
}

async function logoutCmd() {
  const cfg = await rem.readGlobal();
  delete cfg.token;
  delete cfg.userId;
  await rem.writeGlobal(cfg);
  console.log("Logged out.");
}

module.exports = { loginCmd, logoutCmd };