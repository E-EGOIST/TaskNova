import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth";
import skillRoutes from "./routes/skills";
import taskRoutes from "./routes/tasks";
import userRoutes from "./routes/users";
import availabilityRoutes from "./routes/availability";
import adminRoutes from "./routes/admin";
import managerRoutes from "./routes/manager";
import meRoutes from "./routes/me";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in .env");
}

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }));

app.use("/api/auth", authRoutes);
app.use("/api/skills", skillRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/me", meRoutes);

app.get("/", (_req, res) => {
  res.send("TaskNova API is running.");
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "TaskNova" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`TaskNova server running on http://localhost:${PORT}`);
});