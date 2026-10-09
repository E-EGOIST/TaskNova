import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import skillRoutes from "./routes/skills";
import taskRoutes from "./routes/tasks";
import userRoutes from "./routes/users";
import availabilityRoutes from "./routes/availability";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in .env");
}

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/skills", skillRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/availability", availabilityRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "TaskNova" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`TaskNova server running on http://localhost:${PORT}`);
});