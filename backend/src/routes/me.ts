import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      maxHoursPerWeek: true,
      department: { select: { name: true } },
      manager: { select: { name: true } },
      skills: { include: { skill: true } },
    },
  });
  if (!me) return res.status(404).json({ error: "User not found" });
  res.json(me);
});

router.patch("/password", requireAuth, async (req, res) => {
  const p = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে" });

  const u = await prisma.user.findUnique({ where: { id: req.user!.id } });
  const ok = u && (await bcrypt.compare(p.data.currentPassword, u.passwordHash));
  if (!u || !ok) return res.status(400).json({ error: "বর্তমান পাসওয়ার্ড ভুল" });

  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await bcrypt.hash(p.data.newPassword, 10) },
  });
  res.json({ ok: true });
});

export default router;