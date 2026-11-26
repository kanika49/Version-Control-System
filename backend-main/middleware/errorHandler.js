function notFound(req, res) {
  res.status(404).json({ message: "Route not found" });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.code === 11000) {
    return res.status(409).json({ message: "Already exists", fields: Object.keys(err.keyPattern || {}) });
  }
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Malformed JSON" });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request is too large" });
  if (err.name === "CastError" || err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }
  // Errors we raised on purpose with an HTTP status (e.g. 409 non-fast-forward, 413 quota)
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ message: err.message, reason: err.reason });
  }
  console.error(err); // log details server-side only
  res.status(500).json({ message: "Server error" });
}

module.exports = { notFound, errorHandler };