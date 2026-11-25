const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const Repository = require("../models/repoModel");
const Issue = require("../models/issueModel");
const asyncHandler = require("../middleware/asyncHandler");

const signToken = (id) =>
  jwt.sign({ id: String(id) }, process.env.JWT_SECRET_KEY, { expiresIn: "1h" });

const signup = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  const existing = await User.findOne({ $or: [{ username }, { email }] });
  if (existing) return res.status(409).json({ message: "Username or email already in use" });

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ username, email, password: hashed });

  // FIX: use the created user's _id (the old code used result.insertId, which is undefined)
  res.status(201).json({ token: signToken(user._id), userId: user._id });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  const ok = user && (await bcrypt.compare(password, user.password));
  // Same message for "no such user" and "wrong password" so attackers can't tell which.
  if (!ok) return res.status(401).json({ message: "Invalid credentials!" });

  res.json({ token: signToken(user._id), userId: user._id });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).select("username").limit(100); // never expose emails/hashes
  res.json(users);
});

const getUserProfile = asyncHandler(async (req, res) => {
  const isSelf = req.userId === req.params.id;
  // Owner sees their full profile (minus password); others see only public fields.
  const user = await User.findById(req.params.id).select(isSelf ? "-password" : "username createdAt");
  if (!user) return res.status(404).json({ message: "User not found!" });
  res.json(user);
});

const updateUserProfile = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const update = {};
  if (email) update.email = email;
  if (password) update.password = await bcrypt.hash(password, 10);

  // FIX: findByIdAndUpdate returns the document itself (the old code checked result.value => always 404)
  const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true })
    .select("-password");
  if (!user) return res.status(404).json({ message: "User not found!" });
  res.json(user);
});

const deleteUserProfile = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const user = await User.findByIdAndDelete(id); // FIX: old code checked "deleteCount" (typo)
  if (!user) return res.status(404).json({ message: "User not found!" });

  // Clean up everything that belonged to this user.
  const ownedRepos = await Repository.find({ owner: id }).select("_id");
  const ownedIds = ownedRepos.map((r) => r._id);
  const authoredIssues = await Issue.find({ author: id }).select("_id");
  await Issue.deleteMany({ $or: [{ repository: { $in: ownedIds } }, { author: id }] });
  await Repository.updateMany({}, { $pull: { issues: { $in: authoredIssues.map((i) => i._id) } } });
  await Repository.deleteMany({ owner: id });

  res.json({ message: "User Profile Deleted!" });
});

module.exports = { signup, login, getAllUsers, getUserProfile, updateUserProfile, deleteUserProfile };