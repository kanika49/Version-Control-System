const jwt = require("jsonwebtoken");

function readToken(req) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  return scheme === "Bearer" && token ? token : null;
}

// Requires a valid JWT. Sets req.userId.
function authMiddleware(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: "Authentication required" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
    req.userId = String(payload.id);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Token optional: sets req.userId if valid, otherwise continues as anonymous.
function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (token) {
    try {
      req.userId = String(jwt.verify(token, process.env.JWT_SECRET_KEY).id);
    } catch {
      /* treat bad token as anonymous */
    }
  }
  next();
}

module.exports = { authMiddleware, optionalAuth };