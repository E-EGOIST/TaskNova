import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("ADMIN", "MANAGER"));

router.get("/overview", async (_req, res) => {
  const [members, tasks, assignments, leaves, skills] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MEMBER", isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        maxHoursPerWeek: true,
        skills: { include: { skill: true } },
      },
    }),
    prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      include: { skills: { include: { skill: true } } },
    }),
    prisma.assignment.findMany({
      where: { active: true },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.availability.findMany({
      where: { type: "LEAVE", end: { gte: new Date() } },
      orderBy: { start: "asc" },
    }),
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
  ]);
  res.json({ members, tasks, assignments, leaves, skills });
});

export default router;