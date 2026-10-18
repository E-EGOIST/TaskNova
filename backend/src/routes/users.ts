import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// সব member দেখা (skill সহ)
router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, maxHoursPerWeek: true,
      skills: { include: { skill: true } },
    },
  });
  res.json(users);
});

// কোনো user-এর skill সেট করা
router.put("/:id/skills", requireAuth, requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const userId = Number(req.params.id);
  const parsed = z
    .object({
      skills: z.array(
        z.object({
          skillId: z.number().int(),
          proficiency: z.number().int().min(1).max(5),
        })
      ),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  try {
    await prisma.$transaction([
      prisma.userSkill.deleteMany({ where: { userId } }),
      prisma.userSkill.createMany({
        data: parsed.data.skills.map((s) => ({ userId, ...s })),
      }),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Could not update skills (check ids)" });
  }
});

export default router;