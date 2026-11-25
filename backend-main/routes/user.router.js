const express = require("express");
const rateLimit = require("express-rate-limit");
const c = require("../controllers/userController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { requireSelf } = require("../middleware/authorizeMiddleware");
const { validate, validateObjectIds } = require("../middleware/validate");

const router = express.Router();

// Slow down password guessing: 20 attempts / 15 min / IP on login+signup.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { message: "Too many attempts, try again later" },
});

router.post("/signup", authLimiter, validate("signup"), c.signup);
router.post("/login", authLimiter, validate("login"), c.login);
router.get("/allUsers", authMiddleware, c.getAllUsers);
router.get("/userProfile/:id", authMiddleware, validateObjectIds("id"), c.getUserProfile);
router.put("/updateProfile/:id", authMiddleware, validateObjectIds("id"), requireSelf, validate("updateProfile"), c.updateUserProfile);
router.delete("/deleteProfile/:id", authMiddleware, validateObjectIds("id"), requireSelf, c.deleteUserProfile);

module.exports = router;