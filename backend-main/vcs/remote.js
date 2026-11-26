// Everything the CLI needs to talk to the server: saved login, the repo's remote, HTTP calls,
// and the actual transfer of objects (what to send, what to fetch, and how to write it safely).

const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const o = require("./objects");
const r = require("./repo");
const codec = require("./codec");

const DEFAULT_SERVER = "http://localhost:3002";

// ---------- saved login (~/.kgitrc) ----------
const globalFile = () => path.join(process.env.KGIT_HOME || os.homedir(), ".kgitrc");

async function readGlobal() {
  try {
    return JSON.parse(await fs.readFile(globalFile(), "utf8"));
  } catch {
    return {};
  }
}
const writeGlobal = (cfg) => fs.writeFile(globalFile(), JSON.stringify(cfg, null, 2), { mode: 0o600 }); // owner-only file

async function serverUrl() {
  return (process.env.KGIT_SERVER || (await readGlobal()).server || DEFAULT_SERVER).replace(/\/+$/, "");
}
const getToken = async () => (await readGlobal()).token || null;
async function requireToken() {
  const token = await getToken();
  if (!token) throw new Error("You are not logged in. Run `kgit login` first.");
  return token;
}

// ---------- this repository's remote (.kgit/config.json) ----------
const configFile = (root) => r.kgitPath(root, "config.json");

async function readConfig(root) {
  try {
    return JSON.parse(await fs.readFile(configFile(root), "utf8"));
  } catch {
    return {};
  }
}
const writeConfig = (root, cfg) => fs.writeFile(configFile(root), JSON.stringify(cfg, null, 2));

async function requireRemote(root) {
  const { remote } = await readConfig(root);
  if (!remote) throw new Error("No remote set. Run `kgit remote <repository-id>` (copy the id from the repository page).");
  return remote; // { server, repoId }
}

// ---------- HTTP ----------
async function call(method, server, pathname, { token, body, authFailMessage } = {}) {
  let res;
  try {
    res = await fetch(server + pathname, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(`Cannot reach ${server}. Is the server running? (${e.cause?.code || e.message})`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    if (res.status === 401) throw new Error(authFailMessage || "Not logged in, or your session expired. Run `kgit login`.");
    const err = new Error(data?.message || `Server error ${res.status}`);
    err.status = res.status;
    err.reason = data?.reason;
    throw err;
  }
  return data;
}

// ---------- remote-tracking branches (what the server had when we last talked to it) ----------
async function writeRemoteRef(root, branch, hash) {
  const file = r.kgitPath(root, "refs", "remotes", "origin", ...branch.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, hash + "\n");
}

// ---------- local object files ----------
const objectFile = (root, hash) => path.join(o.objectsDir(root), hash.slice(0, 2), hash.slice(2));
async function existsLocal(root, hash) {
  try {
    await fs.access(objectFile(root, hash));
    return true;
  } catch {
    return false;
  }
}

// ---------- push ----------

// Every object (commits, trees, files) reachable from `tip`, skipping commits the server already has.
async function collectForPush(root, tip, skipCommits) {
  const found = new Set();
  const seen = new Set();
  const addTree = async (hash) => {
    if (found.has(hash)) return;
    found.add(hash);
    for (const e of await o.readTree(hash, root)) {
      if (e.type === "tree") await addTree(e.hash);
      else found.add(e.hash);
    }
  };
  const stack = [tip];
  while (stack.length) {
    const h = stack.pop();
    if (seen.has(h) || skipCommits.has(h)) continue;
    seen.add(h);
    const commit = await o.readCommit(h, root);
    found.add(h);
    stack.push(...commit.parents);
    await addTree(commit.tree);
  }
  return [...found];
}

// Ask the server which of these it does NOT have, so only those get uploaded.
async function missingOnRemote(remote, token, hashes) {
  const out = [];
  for (let i = 0; i < hashes.length; i += 5000) {
    const res = await call("POST", remote.server, `/repo/${remote.repoId}/objects/missing`, {
      token,
      body: { hashes: hashes.slice(i, i + 5000) },
    });
    out.push(...res.missing);
  }
  return out;
}

// Upload in batches (by size) so a big push does not need one giant request.
async function uploadObjects(root, remote, token, hashes) {
  let batch = [];
  let bytes = 0;
  let sent = 0;
  const flush = async () => {
    if (!batch.length) return;
    await call("PUT", remote.server, `/repo/${remote.repoId}/objects`, { token, body: { objects: batch } });
    sent += batch.length;
    process.stdout.write(`\rUploading objects: ${sent}/${hashes.length}`);
    batch = [];
    bytes = 0;
  };
  for (const hash of hashes) {
    const raw = await fs.readFile(objectFile(root, hash)); // already compressed on disk, send as is
    batch.push({ hash, data: raw.toString("base64") });
    bytes += raw.length;
    if (batch.length >= 200 || bytes >= 3 * 1024 * 1024) await flush();
  }
  await flush();
  if (sent) process.stdout.write("\n");
  return sent;
}

// ---------- pull ----------

// Download everything needed for `tip` that we don't have, CHECK it, then write it children-first
// (files, then folders, then commits) so an interrupted pull never leaves a commit without its contents.
async function fetchObjects(root, remote, token, tip) {
  const raw = new Map(); // hash -> compressed bytes
  const decoded = new Map(); // hash -> { type, content }
  let pending = [tip];

  while (pending.length) {
    const want = [];
    for (const h of new Set(pending)) if (!raw.has(h) && !(await existsLocal(root, h))) want.push(h);
    pending = [];
    for (let i = 0; i < want.length; i += 500) {
      let batch = want.slice(i, i + 500);
      while (batch.length) {
        const res = await call("POST", remote.server, `/repo/${remote.repoId}/objects/get`, { token, body: { hashes: batch } });
        if (res.missing.length) throw new Error(`The server is missing object ${res.missing[0].slice(0, 12)}`);
        for (const { hash, data } of res.objects) {
          const bytes = Buffer.from(data, "base64");
          const obj = codec.decodeObject(bytes, hash); // never trust the server: verify hash and structure
          raw.set(hash, bytes);
          decoded.set(hash, obj);
          if (obj.type === "commit") {
            const c = codec.parseCommitContent(obj.content, hash);
            pending.push(...c.parents, c.tree);
          } else if (obj.type === "tree") {
            const entries = codec.parseTreeContent(obj.content);
            codec.validateTreeEntries(entries); // refuse names like "../../x" before anything touches the disk
            pending.push(...entries.map((e) => e.hash));
          }
        }
        batch = res.pending; // anything the server could not fit in one response
      }
    }
  }

  const written = new Set();
  const put = async (hash) => {
    if (written.has(hash) || !raw.has(hash)) return; // already written, or we already had it
    const file = objectFile(root, hash);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, raw.get(hash));
    await fs.rename(tmp, file); // atomic: a file is either complete or absent
    written.add(hash);
  };
  const putTree = async (hash) => {
    if (written.has(hash) || !decoded.has(hash)) return;
    for (const e of codec.parseTreeContent(decoded.get(hash).content)) {
      if (e.type === "tree") await putTree(e.hash);
      else await put(e.hash);
    }
    await put(hash);
  };

  // Order the fetched commits so parents come before children (iterative, so long histories can't overflow the stack).
  const commits = [...decoded].filter(([, v]) => v.type === "commit").map(([h, v]) => codec.parseCommitContent(v.content, h));
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const state = new Set();
  const order = [];
  for (const start of commits) {
    if (state.has(start.hash)) continue;
    state.add(start.hash);
    const stack = [[start, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const parents = top[0].parents.filter((p) => byHash.has(p));
      if (top[1] < parents.length) {
        const p = byHash.get(parents[top[1]++]);
        if (!state.has(p.hash)) {
          state.add(p.hash);
          stack.push([p, 0]);
        }
      } else {
        order.push(top[0]);
        stack.pop();
      }
    }
  }
  for (const c of order) {
    await putTree(c.tree);
    await put(c.hash);
  }
  return decoded.size;
}

module.exports = {
  DEFAULT_SERVER, readGlobal, writeGlobal, serverUrl, getToken, requireToken,
  readConfig, writeConfig, requireRemote, call, writeRemoteRef, existsLocal,
  collectForPush, missingOnRemote, uploadObjects, fetchObjects,
};