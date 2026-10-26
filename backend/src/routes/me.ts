import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { eventsFor, flowOf, taskIdOf, type Stage } from "../lib/workflow";

const router = Router();
router.use(requireAuth);

async function logEvent(req: Request, action: string, detail: string) {
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
  await prisma.auditLog
    .create({ data: { userId: req.user!.id, userName: me?.name, action, detail } })
    .catch(() => {});
}

const note = z.string().max(500).optional();

// আমার সক্রিয় assignment ও তার বর্তমান ধাপ
async function myActive(taskId: number, uid: number) {
  const a = await prisma.assignment.findFirst({
    where: { taskId, userId: uid, active: true },
    include: { task: true },
  });
  if (!a) return null;
  const events = await eventsFor([taskId]);
  return { a, task: a.task, flow: flowOf(a.task, a.assignedAt, events) };
}

/* ---------- পুরোনো ছোট profile (আগের frontend-এর জন্য) ---------- */
router.get("/", async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, name: true, email: true, role: true, maxHoursPerWeek: true,
      department: { select: { name: true } },
      manager: { select: { name: true } },
      skills: { include: { skill: true } },
    },
  });
  if (!me) return res.status(404).json({ error: "User not found" });
  res.json(me);
});

/* ---------- Member dashboard-এর সব তথ্য ---------- */
router.get("/overview", async (req, res) => {
  const uid = req.user!.id;
  const [me, assignments, leaves, allSkills] = await Promise.all([
    prisma.user.findUnique({
      where: { id: uid },
      select: {
        id: true, name: true, email: true, role: true, maxHoursPerWeek: true,
        department: { select: { name: true } },
        manager: { select: { name: true } },
        skills: { include: { skill: true } },
      },
    }),
    prisma.assignment.findMany({
      where: { userId: uid },
      orderBy: { assignedAt: "desc" },
      include: { task: { include: { skills: { include: { skill: true } } } } },
    }),
    prisma.availability.findMany({ where: { userId: uid }, orderBy: { start: "asc" } }),
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!me) return res.status(404).json({ error: "User not found" });

  const taskIds: number[] = Array.from(new Set<number>(assignments.map((a: { taskId: number }) => a.taskId)));
  const events = await eventsFor(taskIds);

  // কোন টাস্ক আমার কাছ থেকে কখন সরানো হয়েছে
  const inactiveIds: number[] = assignments.filter((a: { active: boolean }) => !a.active).map((a: { taskId: number }) => a.taskId);
  const others: { taskId: number; assignedAt: Date }[] = inactiveIds.length
    ? await prisma.assignment.findMany({
        where: { taskId: { in: inactiveIds }, userId: { not: uid } },
        select: { taskId: true, assignedAt: true },
      })
    : [];

  const items = assignments.map((a: any) => {
    const later = others
      .filter((o) => o.taskId === a.taskId && o.assignedAt.getTime() > a.assignedAt.getTime())
      .sort((x, y) => x.assignedAt.getTime() - y.assignedAt.getTime())[0];
    return {
      id: a.id,
      active: a.active,
      assignedAt: a.assignedAt,
      replacedAt: !a.active && later ? later.assignedAt : null,
      score: a.score,
      scoreBreakdown: a.scoreBreakdown,
      task: a.task,
      flow: a.active ? flowOf(a.task, a.assignedAt, events) : null,
    };
  });

  const titleOf = new Map<number, string>(assignments.map((a: any) => [a.taskId, a.task.title]));
  const reviews = events
    .filter((e) => e.action === "TASK_APPROVED" || e.action === "TASK_REJECTED")
    .map((e) => {
      const parts = (e.detail ?? "").split("|");
      return {
        taskId: taskIdOf(e),
        title: titleOf.get(taskIdOf(e)) ?? parts[1] ?? "",
        decision: e.action === "TASK_APPROVED" ? "APPROVED" : "REJECTED",
        note: parts.slice(2).join("|"),
        at: e.createdAt,
      };
    });

  res.json({ me, items, leaves, allSkills, reviews });
});

/* ---------- নিজের তথ্য ---------- */
router.patch("/profile", async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "নাম কমপক্ষে ২ অক্ষরের হতে হবে" });
  await prisma.user.update({ where: { id: req.user!.id }, data: { name: p.data.name } });
  res.json({ ok: true });
});

router.put("/skills", async (req, res) => {
  const p = z
    .object({ skills: z.array(z.object({ skillId: z.number().int(), proficiency: z.number().int().min(1).max(5) })) })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const uid = req.user!.id;
  const list = Array.from(new Map(p.data.skills.map((s) => [s.skillId, s])).values());
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.userSkill.deleteMany({ where: { userId: uid } });
      if (list.length) await tx.userSkill.createMany({ data: list.map((s) => ({ userId: uid, ...s })) });
    });
    await logEvent(req, "SKILLS_SELF_UPDATED", `${list.length} skill`);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Skill সেভ করা যায়নি (skill বৈধ কি না দেখুন)" });
  }
});

router.patch("/password", async (req, res) => {
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

/* ---------- টাস্কের ধাপ ---------- */
const NOT_YOURS = "এই টাস্ক আপনার নামে সক্রিয় নেই";

router.post("/tasks/:id/accept", async (req, res) => {
  const id = Number(req.params.id);
  const cur = await myActive(id, req.user!.id);
  if (!cur) return res.status(404).json({ error: NOT_YOURS });
  if (cur.flow.stage !== "ASSIGNED") return res.status(400).json({ error: "এই টাস্ক এখন Accept করা যায় না" });
  await logEvent(req, "TASK_ACCEPTED", `${id}|${cur.task.title}`);
  res.json({ ok: true });
});

router.post("/tasks/:id/start", async (req, res) => {
  const id = Number(req.params.id);
  const cur = await myActive(id, req.user!.id);
  if (!cur) return res.status(404).json({ error: NOT_YOURS });
  const stage: Stage = cur.flow.stage;
  if (stage !== "ASSIGNED" && stage !== "ACCEPTED") {
    return res.status(400).json({ error: "এই টাস্ক এখন শুরু করা যায় না" });
  }
  if (stage === "ASSIGNED") await logEvent(req, "TASK_ACCEPTED", `${id}|${cur.task.title}`);
  await prisma.task.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  await logEvent(req, "TASK_STARTED", `${id}|${cur.task.title}`);
  res.json({ ok: true });
});

router.post("/tasks/:id/progress", async (req, res) => {
  const id = Number(req.params.id);
  const p = z.object({ percent: z.number().int().min(0).max(100), note }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Progress ০ থেকে ১০০-এর মধ্যে হতে হবে" });
  const cur = await myActive(id, req.user!.id);
  if (!cur) return res.status(404).json({ error: NOT_YOURS });
  if (cur.flow.stage !== "IN_PROGRESS") return res.status(400).json({ error: "টাস্ক চলমান অবস্থায় নেই" });
  await logEvent(req, "TASK_PROGRESS", `${id}|${p.data.percent}|${p.data.note ?? ""}`);
  res.json({ ok: true });
});

router.post("/tasks/:id/submit", async (req, res) => {
  const id = Number(req.params.id);
  const p = z.object({ note }).safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const cur = await myActive(id, req.user!.id);
  if (!cur) return res.status(404).json({ error: NOT_YOURS });
  if (cur.flow.stage !== "IN_PROGRESS") return res.status(400).json({ error: "আগে টাস্ক শুরু করতে হবে" });
  await logEvent(req, "TASK_SUBMITTED", `${id}|${p.data.note ?? ""}`);
  res.json({ ok: true });
});

router.post("/tasks/:id/request-reassign", async (req, res) => {
  const id = Number(req.params.id);
  const p = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "কারণ লিখুন (কমপক্ষে ৩ অক্ষর)" });
  const cur = await myActive(id, req.user!.id);
  if (!cur) return res.status(404).json({ error: NOT_YOURS });
  if (!["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(cur.flow.stage)) {
    return res.status(400).json({ error: "এই অবস্থায় reassign চাওয়া যায় না" });
  }
  if (cur.flow.reassign) return res.status(400).json({ error: "আপনার অনুরোধ আগেই পাঠানো হয়েছে" });
  await logEvent(req, "TASK_REASSIGN_REQUEST", `${id}|${p.data.reason}`);
  res.json({ ok: true });
});

export default router;