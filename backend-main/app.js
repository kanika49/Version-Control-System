const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mainRouter = require("./routes/main.router");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();
app.set("trust proxy", 1); // correct client IPs behind Render/Railway/Vercel (needed for rate limiting)

app.use(helmet());
// FIX: no more cors({origin:"*"}); allow only your frontend(s), set CORS_ORIGIN in .env
const origins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "100kb" })); // body-parser is built into Express

app.use("/", mainRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = app;