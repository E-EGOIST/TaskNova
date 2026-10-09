import { getSuggestions } from "../services/allocationEngine";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

const taskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  estimatedHours: z.number().positive(),
  deadline: z.string().datetime(),
  skills: z
    .array(
      z.object({
        skillId: z.number().int(),
        minLevel: z.number().int().min(1).max(5).default(1),
      })
    )
    .default([]),
});

// টাস্ক তৈরি (Admin/Manager)
router.post("/", requireAuth, requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }
  const { skills, deadline, ...data } = parsed.data;

  try {
    const task = await prisma.task.create({
      data: {
        ...data,
        deadline: new Date(deadline),
        createdById: req.user!.id,
        skills: { create: skills },
      },
      include: { skills: { include: { skill: true } } },
    });
    res.status(201).json(task);
  } catch {
    res.status(400).json({ error: "Could not create task (check skillId)" });
  }
});

// সব টাস্ক দেখা
router.get("/", requireAuth, async (_req, res) => {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    include: { skills: { include: { skill: true } } },
  });
  res.json(tasks);
});
// Top 3 suggestion
router.get("/:id/suggestions", requireAuth, requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const suggestions = await getSuggestions(Number(req.params.id));
  if (suggestions === null) return res.status(404).json({ error: "Task not found" });
  res.json(suggestions);
});

// Manager confirm করে assign
router.post("/:id/assign", requireAuth, requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const taskId = Number(req.params.id);
  const parsed = z.object({ userId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "userId required" });

  const suggestions = await getSuggestions(taskId, 50);
  if (suggestions === null) return res.status(404).json({ error: "Task not found" });
  const pick = suggestions.find((s) => s.userId === parsed.data.userId);
  if (!pick) return res.status(400).json({ error: "This user is not eligible for the task" });

  try {
    const assignment = await prisma.$transaction(async (tx) => {
      // শুধু PENDING হলেই assign হবে, এতে একই টাস্ক দুইবার assign ঠেকে
      const updated = await tx.task.updateMany({
        where: { id: taskId, status: "PENDING" },
        data: { status: "ASSIGNED" },
      });
      if (updated.count === 0) throw new Error("ALREADY_ASSIGNED");

      return tx.assignment.create({
        data: {
          taskId,
          userId: pick.userId,
          score: pick.score,
          scoreBreakdown: pick.breakdown,
        },
      });
    });
    res.status(201).json(assignment);
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_ASSIGNED") {
      return res.status(409).json({ error: "Task already assigned" });
    }
    res.status(500).json({ error: "Could not assign" });
  }
});
export default router;