import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

const leaveSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  userId: z.number().int().optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const start = new Date(parsed.data.start);
  const end = new Date(parsed.data.end);
  if (end <= start) return res.status(400).json({ error: "end must be after start" });

  const isManager = ["ADMIN", "MANAGER"].includes(req.user!.role);
  const targetId = isManager && parsed.data.userId ? parsed.data.userId : req.user!.id;

  try {
    const leave = await prisma.availability.create({
      data: { userId: targetId, start, end, type: "LEAVE" },
    });
    res.status(201).json(leave);
  } catch {
    res.status(400).json({ error: "Could not create leave (check userId)" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  const isManager = ["ADMIN", "MANAGER"].includes(req.user!.role);
  const queryId = Number(req.query.userId);
  const targetId = isManager && queryId ? queryId : req.user!.id;

  const list = await prisma.availability.findMany({
    where: { userId: targetId },
    orderBy: { start: "asc" },
  });
  res.json(list);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const leave = await prisma.availability.findUnique({ where: { id } });
  if (!leave) return res.status(404).json({ error: "Not found" });

  const isManager = ["ADMIN", "MANAGER"].includes(req.user!.role);
  if (!isManager && leave.userId !== req.user!.id) {
    return res.status(403).json({ error: "Permission denied" });
  }
  await prisma.availability.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;