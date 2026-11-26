// Pure helpers for reading/validating objects. Used by BOTH the CLI and the server,
// and they never trust their input: everything that arrives over the network is checked here.

const zlib = require("zlib");
const crypto = require("crypto");

const HASH_RE = /^[0-9a-f]{64}$/;
const MAX_OBJECT_BYTES = 10 * 1024 * 1024; // refuse objects that unpack to more than 10 MB (zip-bomb protection)
const TYPES = new Set(["blob", "tree", "commit"]);

class ObjectError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const hashFull = (full) => crypto.createHash("sha256").update(full).digest("hex");

// Compressed bytes -> { type, content }. Verifies size, type and that the hash really matches the content.
function decodeObject(compressed, expectedHash) {
  let full;
  try {
    full = zlib.inflateSync(compressed, { maxOutputLength: MAX_OBJECT_BYTES + 64 });
  } catch {
    throw new ObjectError("Corrupt or oversized object");
  }
  const nul = full.indexOf(0);
  if (nul < 1) throw new ObjectError("Malformed object header");
  const [type, size] = full.subarray(0, nul).toString().split(" ");
  const content = full.subarray(nul + 1);
  if (!TYPES.has(type)) throw new ObjectError("Unknown object type");
  if (Number(size) !== content.length) throw new ObjectError("Object size mismatch");
  if (expectedHash && hashFull(full) !== expectedHash) throw new ObjectError("Hash mismatch");
  return { type, content };
}

// A file or folder name that is safe to create on someone's computer.
function isSafeName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 255) return false;
  if (name === "." || name === "..") return false;
  if (/[\/\\\0:]/.test(name)) return false; // no path separators, NUL, or ":" (drive letters / Windows streams)
  const lower = name.toLowerCase();
  return lower !== ".kgit" && lower !== ".git";
}

function parseTreeContent(content) {
  const bad = () => new ObjectError("Malformed tree");
  const text = content.toString("utf8");
  if (text === "") return [];
  if (!text.endsWith("\n")) throw bad();
  return text
    .slice(0, -1)
    .split("\n")
    .map((line) => {
      const i = line.indexOf("\t");
      if (i < 0) throw bad();
      const [mode, type, hash] = line.slice(0, i).split(" ");
      const name = line.slice(i + 1);
      if (!HASH_RE.test(hash || "") || !(type === "blob" || type === "tree") || !(mode === "100644" || mode === "040000")) {
        throw bad();
      }
      return { mode, type, hash, name };
    });
}

// Reject trees that would write outside the repository when someone checks them out ("path traversal").
function validateTreeEntries(entries) {
  const seen = new Set();
  for (const e of entries) {
    if (!isSafeName(e.name)) throw new ObjectError(`Unsafe file name in tree: ${JSON.stringify(e.name)}`);
    if (seen.has(e.name)) throw new ObjectError(`Duplicate name in tree: ${e.name}`);
    seen.add(e.name);
  }
}

function parseCommitContent(content, hash) {
  const bad = () => new ObjectError("Malformed commit");
  const text = content.toString("utf8");
  const sep = text.indexOf("\n\n");
  const head = sep < 0 ? text : text.slice(0, sep);
  const commit = { hash, message: sep < 0 ? "" : text.slice(sep + 2), parents: [] };
  for (const line of head.split("\n")) {
    const i = line.indexOf(" ");
    if (i < 0) throw bad();
    const key = line.slice(0, i);
    const value = line.slice(i + 1);
    if (key === "parent") commit.parents.push(value);
    else commit[key] = value;
  }
  if (!HASH_RE.test(commit.tree || "") || !commit.parents.every((p) => HASH_RE.test(p))) throw bad();
  if (typeof commit.author !== "string" || typeof commit.time !== "string") throw bad();
  commit.parent = commit.parents[0];
  return commit;
}

module.exports = {
  HASH_RE, MAX_OBJECT_BYTES, ObjectError, hashFull,
  decodeObject, isSafeName, parseTreeContent, validateTreeEntries, parseCommitContent,
};