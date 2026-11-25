const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select:false => password is NEVER returned unless you ask with .select("+password")
    password: { type: String, required: true, select: false },
    repositories: [{ type: Schema.Types.ObjectId, ref: "Repository" }],
    followedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    starRepos: [{ type: Schema.Types.ObjectId, ref: "Repository" }],
  },
  { timestamps: true } // FIX: options go in the 2nd argument, not inside the fields
);

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);