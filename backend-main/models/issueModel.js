const mongoose = require("mongoose");
const { Schema } = mongoose;

const IssueSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 5000 },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    repository: { type: Schema.Types.ObjectId, ref: "Repository", required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Issue || mongoose.model("Issue", IssueSchema);