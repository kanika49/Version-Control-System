const { z } = require("zod");

const OBJECT_ID = /^[0-9a-fA-F]{24}$/; // (mongoose.isValidObjectId also accepts any 12-char string)

const password = z.string().min(8, "At least 8 characters").max(72, "At most 72 characters"); // bcrypt limit
const email = z.string().trim().toLowerCase().email();

const schemas = {
  signup: z.object({
    username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, _ and - only"),
    email,
    password,
  }),
  login: z.object({ email, password: z.string().min(1).max(72) }),
  updateProfile: z
    .object({ email: email.optional(), password: password.optional() })
    .refine((d) => d.email || d.password, { message: "Provide email or password" }),
  createRepo: z.object({
    name: z.string().trim().regex(/^[\w.-]{1,100}$/, "Letters, numbers, . _ - only (max 100)"),
    description: z.string().max(500).optional(),
    visibility: z.boolean().optional(),
  }),
  updateRepo: z
    .object({ description: z.string().max(500).optional(), content: z.string().max(10000).optional() })
    .refine((d) => d.description !== undefined || d.content !== undefined, { message: "Nothing to update" }),
  createIssue: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5000),
  }),
  updateIssue: z
    .object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(5000),
      status: z.enum(["open", "closed"]),
    })
    .partial()
    .refine((d) => Object.keys(d).length > 0, { message: "Nothing to update" }),
};

// validate("signup") -> checks req.body, replaces it with the cleaned data (unknown keys dropped).
const validate = (name) => (req, res, next) => {
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

// validateObjectIds("id", "repoId") -> rejects malformed ids before they reach the database.
const validateObjectIds = (...names) => (req, res, next) => {
  for (const n of names) {
    if (!OBJECT_ID.test(req.params[n] || "")) return res.status(400).json({ message: `Invalid ${n}` });
  }
  next();
};

module.exports = { validate, validateObjectIds };