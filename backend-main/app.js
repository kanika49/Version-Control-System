const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mainRouter = require("./routes/main.router");
const syncRouter = require("./routes/sync.router");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();
app.set("trust proxy", 1); // correct client IPs behind Render/Railway/Vercel (needed for rate limiting)

app.use(helmet());
// No wildcard CORS: allow only your frontend(s). Set CORS_ORIGIN in .env
const origins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim());
app.use(cors({ origin: origins }));

// Push/pull routes read their own (larger) request bodies, so they must come BEFORE the global 100 KB limit.
app.use("/", syncRouter);
app.use(express.json({ limit: "100kb" }));

app.use("/", mainRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = app;