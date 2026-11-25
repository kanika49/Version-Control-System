// Line diff using Myers' O(ND) algorithm (the same one Git uses by default).
// Returns an edit script: [{type: "eq" | "del" | "ins", line}, ...]

function diffLines(a, b) {
  const N = a.length;
  const M = b.length;
  const max = N + M;
  if (max === 0) return [];
  const off = max; // v is indexed by diagonal k, which can be negative, so shift by `off`
  const v = new Array(2 * max + 2).fill(0);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice()); // remember v as it was before round d (needed to walk back)
    for (let k = -d; k <= d; k += 2) {
      // Go down (insert) or right (delete), whichever reaches further.
      let x;
      if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
      else x = v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) {
        x++;
        y++; // follow the free diagonal while lines are equal
      }
      v[off + k] = x;
      if (x >= N && y >= M) return backtrack(trace, a, b, off);
    }
  }
  return []; // unreachable
}

// Walk the saved rounds backwards to recover the actual edits.
function backtrack(trace, a, b, off) {
  let x = a.length;
  let y = b.length;
  const ops = [];
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1;
    const prevX = v[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: "eq", line: a[x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ type: "ins", line: b[y - 1] });
      else ops.push({ type: "del", line: a[x - 1] });
    }
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

// Group the edit script into hunks with `ctx` lines of context, like `git diff`.
function toHunks(ops, ctx = 3) {
  let ai = 0;
  let bi = 0;
  const anno = ops.map((op) => {
    const o = { ...op, a: ai, b: bi };
    if (op.type !== "ins") ai++;
    if (op.type !== "del") bi++;
    return o;
  });
  const changed = [];
  anno.forEach((o, i) => o.type !== "eq" && changed.push(i));
  if (changed.length === 0) return [];

  const ranges = [];
  let start = Math.max(changed[0] - ctx, 0);
  let end = Math.min(changed[0] + ctx, anno.length - 1);
  for (const i of changed.slice(1)) {
    if (i - ctx <= end + 1) end = Math.min(i + ctx, anno.length - 1); // overlaps: merge into this hunk
    else {
      ranges.push([start, end]);
      start = Math.max(i - ctx, 0);
      end = Math.min(i + ctx, anno.length - 1);
    }
  }
  ranges.push([start, end]);

  return ranges.map(([s, e]) => {
    const lines = anno.slice(s, e + 1);
    const aCount = lines.filter((l) => l.type !== "ins").length;
    const bCount = lines.filter((l) => l.type !== "del").length;
    return {
      header: `@@ -${lines[0].a + (aCount ? 1 : 0)},${aCount} +${lines[0].b + (bCount ? 1 : 0)},${bCount} @@`,
      lines,
    };
  });
}

// Split text into lines (a trailing newline does not create an extra empty line).
function splitLines(text) {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

module.exports = { diffLines, toHunks, splitLines };