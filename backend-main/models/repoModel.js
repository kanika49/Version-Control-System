const mongoose = require("mongoose");
const { Schema } = mongoose;

const RepositorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, maxlength: 500 },
    content: [{ type: String }],
    visibility: { type: Boolean, default: true }, // true = public, false = private
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    issues: [{ type: Schema.Types.ObjectId, ref: "Issue" }],
  },
  { timestamps: true }
);

// Repo names are unique PER OWNER (like real GitHub), not globally.
RepositorySchema.index({ owner: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Repository || mongoose.model("Repository", RepositorySchema);


