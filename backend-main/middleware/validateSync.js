const { z } = require("zod");
const { HASH_RE } = require("../vcs/codec");

const hash = z.string().regex(HASH_RE, "Invalid hash");
const branch = z
  .string()
  .max(100)
  .regex(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/, "Invalid branch name")
  .refine((b) => !b.includes("..") && !b.endsWith(".lock") && !b.startsWith("-"), "Invalid branch name");

const schemas = {
  missing: z.object({ hashes: z.array(hash).max(20000) }),
  get: z.object({ hashes: z.array(hash).min(1).max(500) }),
  put: z.object({
    objects: z.array(z.object({ hash, data: z.string().min(1) })).min(1).max(500),
  }),
  refUpdate: z.object({ branch, old: hash.nullable(), new: hash }),
};

const validateBody = (name) => (req, res, next) => {
  const result = schemas[name].safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  req.body = result.data;
  next();
};

module.exports = { validateBody };