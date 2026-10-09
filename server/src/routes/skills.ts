import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// সবাই দেখতে পারবে (login করা থাকলে)
router.get("/", requireAuth, async (_req, res) => {
  const skills = await prisma.skill.findMany({ orderBy: { name: "asc" } });
  res.json(skills);
});

// শুধু Admin/Manager যোগ করতে পারবে
router.post("/", requireAuth, requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  try {
    const skill = await prisma.skill.create({ data: { name: parsed.data.name } });
    res.status(201).json(skill);
  } catch {
    res.status(409).json({ error: "Skill already exists" });
  }
});

export default router;