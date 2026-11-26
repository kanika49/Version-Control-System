const mongoose = require("mongoose");
const { Schema } = mongoose;

// One stored git object (blob / tree / commit), belonging to one repository.
// `data` holds the object exactly as the CLI stores it: zlib-compressed.
const GitObjectSchema = new Schema({
  repo: { type: Schema.Types.ObjectId, ref: "Repository", required: true },
  hash: { type: String, required: true },
  data: { type: Buffer, required: true },
  size: { type: Number, required: true }, // compressed size in bytes (used for the storage quota)
});

// The same content may exist in many repos, but only once per repo.
GitObjectSchema.index({ repo: 1, hash: 1 }, { unique: true });

module.exports = mongoose.models.GitObject || mongoose.model("GitObject", GitObjectSchema);