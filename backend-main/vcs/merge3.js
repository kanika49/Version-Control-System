// Three-way text merge (the idea behind `git merge` / diff3).
// base = the common ancestor, ours / theirs = the two edited versions (all arrays of lines).

const { diffLines } = require("./diff");

// Turn a diff into change blocks over the BASE: [{ start, end, lines }]
// means "base lines start..end-1 were replaced by `lines`".
function changes(base, other) {
  const out = [];
  let bi = 0;
  let cur = null;
  for (const op of diffLines(base, other)) {
    if (op.type === "eq") {
      if (cur) out.push(cur);
      cur = null;
      bi++;
    } else {
      if (!cur) cur = { start: bi, end: bi, lines: [] };
      if (op.type === "del") {
        cur.end++;
        bi++;
      } else cur.lines.push(op.line);
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Two changes clash if they overlap or touch (no unchanged line between them).
const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;

// What one side's version of base[start..end) looks like after applying its changes.
function render(base, start, end, list) {
  const res = [];
  let p = start;
  for (const c of list) {
    res.push(...base.slice(p, c.start), ...c.lines);
    p = c.end;
  }
  res.push(...base.slice(p, end));
  return res;
}

function merge3(base, ours, theirs, oursName = "ours", theirsName = "theirs") {
  const co = changes(base, ours);
  const ct = changes(base, theirs);
  const out = [];
  let conflict = false;
  let pos = 0;
  let i = 0;
  let j = 0;

  while (i < co.length || j < ct.length) {
    const a = co[i];
    const b = ct[j];

    if (a && b && overlaps(a, b)) {
      // Grow one region that contains every change touching it, from both sides.
      let start = Math.min(a.start, b.start);
      let end = Math.max(a.end, b.end);
      const oa = [a];
      const ob = [b];
      i++;
      j++;
      for (let grew = true; grew; ) {
        grew = false;
        if (co[i] && co[i].start <= end) { oa.push(co[i]); end = Math.max(end, co[i].end); i++; grew = true; }
        if (ct[j] && ct[j].start <= end) { ob.push(ct[j]); end = Math.max(end, ct[j].end); j++; grew = true; }
      }
      out.push(...base.slice(pos, start));
      const mine = render(base, start, end, oa);
      const their = render(base, start, end, ob);
      if (mine.join("\n") === their.join("\n")) out.push(...mine); // both made the same edit
      else {
        conflict = true;
        out.push(`<<<<<<< ${oursName}`, ...mine, "=======", ...their, `>>>>>>> ${theirsName}`);
      }
      pos = end;
    } else {
      // Only one side changed here: take its change.
      const c = !b || (a && a.start <= b.start) ? co[i++] : ct[j++];
      out.push(...base.slice(pos, c.start), ...c.lines);
      pos = c.end;
    }
  }
  out.push(...base.slice(pos));
  return { lines: out, conflict };
}

module.exports = { merge3, changes };