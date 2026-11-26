const mongoose = require("mongoose");
const { Schema } = mongoose;

// A branch pointer: "main" -> hash of its latest commit.
// (An array instead of a map because branch names may contain "." and "/", which Mongo map keys cannot.)
const BranchSchema = new Schema(
  { name: { type: String, required: true }, hash: { type: String, required: true } },
  { _id: false }
);

const RepositorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, maxlength: 500 },
    content: [{ type: String }],
    visibility: { type: Boolean, default: true }, // true = public, false = private
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    issues: [{ type: Schema.Types.ObjectId, ref: "Issue" }],
    branches: [BranchSchema],
  },
  { timestamps: true }
);

// Repo names are unique PER OWNER (like real GitHub), not globally.
RepositorySchema.index({ owner: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Repository || mongoose.model("Repository", RepositorySchema);