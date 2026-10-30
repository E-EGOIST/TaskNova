import { Router, Request } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { getSuggestions } from "../services/allocationEngine";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

async function log(req: Request, action: string, detail?: string) {
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
  await prisma.auditLog
    .create({ data: { userId: req.user!.id, userName: me?.name, action, detail } })
    .catch(() => {});
}

const idOrNull = z.number().int().nullable().optional();

/* ---------- Overview ---------- */
router.get("/overview", async (_req, res) => {
  const [users, tasks, assignments, departments, leaves, skills] = await Promise.all([
    prisma.user.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true, name: true, email: true, role: true, isActive: true, maxHoursPerWeek: true,
        departmentId: true, managerId: true, skills: { include: { skill: true } },
      },
    }),
    prisma.task.findMany({ orderBy: { createdAt: "desc" }, include: { skills: { include: { skill: true } } } }),
    prisma.assignment.findMany({
      orderBy: { assignedAt: "desc" },
      include: { task: { select: { title: true } }, user: { select: { name: true } } },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.availability.findMany({ where: { type: "LEAVE", end: { gte: new Date() } } }),
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
  ]);
  res.json({ users, tasks, assignments, departments, leaves, skills });
});

router.get("/audit", async (_req, res) => {
  res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
});

/* ---------- Users ---------- */
const createUser = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).default("MEMBER"),
  departmentId: idOrNull,
  managerId: idOrNull,
});

router.post("/users", async (req, res) => {
  const p = createUser.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "ইনপুট ঠিক নয় (পাসওয়ার্ড কমপক্ষে ৮ অক্ষর)" });
  const exists = await prisma.user.findUnique({ where: { email: p.data.email } });
  if (exists) return res.status(409).json({ error: "Email already in use" });
  const { password, ...rest } = p.data;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await bcrypt.hash(password, 10) },
    select: { id: true, name: true, email: true, role: true },
  });
  await log(req, "USER_CREATED", `${user.email} (${user.role})`);
  res.status(201).json(user);
});

const patchUser = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  isActive: z.boolean().optional(),
  maxHoursPerWeek: z.number().int().min(1).max(80).optional(),
  departmentId: idOrNull,
  managerId: idOrNull,
});

router.patch("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  const p = patchUser.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  if (id === req.user!.id && (p.data.role !== undefined || p.data.isActive === false)) {
    return res.status(400).json({ error: "নিজের role বা active অবস্থা বদলানো যাবে না" });
  }
  try {
    const u = await prisma.user.update({
      where: { id },
      data: p.data,
      select: { id: true, email: true, role: true, isActive: true },
    });
    await log(req, "USER_UPDATED", `${u.email}: ${JSON.stringify(p.data)}`);
    res.json(u);
  } catch {
    res.status(400).json({ error: "Could not update (user not found or email taken)" });
  }
});

router.patch("/users/:id/password", async (req, res) => {
  const id = Number(req.params.id);
  const p = z.object({ password: z.string().min(8) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে" });
  try {
    const u = await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(p.data.password, 10) },
      select: { email: true },
    });
    await log(req, "PASSWORD_RESET", u.email);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

router.delete("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) return res.status(400).json({ error: "নিজেকে মোছা যাবে না" });
  try {
    const u = await prisma.user.delete({ where: { id }, select: { email: true } });
    await log(req, "USER_DELETED", u.email);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "টাস্ক বা assignment থাকলে মোছা যায় না। বদলে নিষ্ক্রিয় (Deactivate) করুন।" });
  }
});

/* ---------- Departments ---------- */
router.post("/departments", async (req, res) => {
  const p = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid name" });
  try {
    const d = await prisma.department.create({ data: { name: p.data.name.trim() } });
    await log(req, "DEPARTMENT_CREATED", d.name);
    res.status(201).json(d);
  } catch {
    res.status(409).json({ error: "Department already exists" });
  }
});

router.patch("/departments/:id", async (req, res) => {
  const p = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid name" });
  try {
    const d = await prisma.department.update({ where: { id: Number(req.params.id) }, data: { name: p.data.name.trim() } });
    await log(req, "DEPARTMENT_RENAMED", d.name);
    res.json(d);
  } catch {
    res.status(400).json({ error: "Could not rename" });
  }
});

router.delete("/departments/:id", async (req, res) => {
  try {
    const d = await prisma.department.delete({ where: { id: Number(req.params.id) } });
    await log(req, "DEPARTMENT_DELETED", d.name);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ---------- Tasks ---------- */
const taskBody = z.object({
  title: z.string().min(2),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  estimatedHours: z.number().positive(),
  deadline: z.string().datetime(),
  category: z.string().nullable().optional(),
  difficulty: z.number().int().min(1).max(5).default(3),
  skills: z.array(z.object({ skillId: z.number().int(), minLevel: z.number().int().min(1).max(5).default(1) })).default([]),
});

router.post("/tasks", async (req, res) => {
  const p = taskBody.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const { skills, deadline, ...data } = p.data;
  try {
    const t = await prisma.task.create({
      data: { ...data, deadline: new Date(deadline), createdById: req.user!.id, skills: { create: skills } },
    });
    await log(req, "TASK_CREATED", t.title);
    res.status(201).json(t);
  } catch {
    res.status(400).json({ error: "Could not create task (check skill)" });
  }
});

const adminPatch = z.object({
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  estimatedHours: z.number().positive().optional(),
  deadline: z.string().datetime().optional(),
  category: z.string().nullable().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  skills: z.array(z.object({ skillId: z.number().int(), minLevel: z.number().int().min(1).max(5) })).optional(),
});

router.patch("/tasks/:id", async (req, res) => {
  const id = Number(req.params.id);
  const p = adminPatch.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });

  const { skills, deadline, ...rest } = p.data;
  try {
    const t = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: { ...rest, ...(deadline ? { deadline: new Date(deadline) } : {}) },
      });
      if (skills) {
        await tx.taskSkill.deleteMany({ where: { taskId: id } });
        const list = Array.from(new Map(skills.map((s) => [s.skillId, s])).values());
        if (list.length) await tx.taskSkill.createMany({ data: list.map((s) => ({ taskId: id, ...s })) });
      }
      return updated;
    });
    await log(req, "TASK_UPDATED", t.title);
    res.json(t);
  } catch {
    res.status(404).json({ error: "Task not found or invalid skill" });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    const t = await prisma.task.delete({ where: { id: Number(req.params.id) } });
    await log(req, "TASK_DELETED", t.title);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Task not found" });
  }
});

/* ---------- Allocation ---------- */
async function doAssign(taskId: number, userId: number, score: number, breakdown: any) {
  await prisma.$transaction(async (tx) => {
    await tx.assignment.updateMany({ where: { taskId, active: true }, data: { active: false } });
    await tx.task.update({ where: { id: taskId }, data: { status: "ASSIGNED" } });
    await tx.assignment.create({ data: { taskId, userId, score, scoreBreakdown: breakdown } });
  });
}

// Manual assign / reassign (যেকোনো সক্রিয় member)
router.post("/tasks/:id/assign", async (req, res) => {
  const taskId = Number(req.params.id);
  const p = z.object({ userId: z.number().int() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "userId required" });

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (["DONE", "CANCELLED"].includes(task.status)) {
    return res.status(400).json({ error: "সম্পন্ন বা বাতিল টাস্ক assign করা যায় না" });
  }
  const target = await prisma.user.findUnique({ where: { id: p.data.userId } });
  if (!target || !target.isActive || target.role !== "MEMBER") {
    return res.status(400).json({ error: "একজন সক্রিয় Member লাগবে" });
  }

  const all = (await getSuggestions(taskId, 500)) ?? [];
  const pick = all.find((s) => s.userId === target.id);
  const breakdown: any = pick?.breakdown ?? { manual: true };
  await doAssign(taskId, target.id, pick?.score ?? 0, breakdown);
  await log(req, task.status === "PENDING" ? "TASK_ASSIGNED" : "TASK_REASSIGNED", `${task.title} → ${target.name}`);
  res.json({ ok: true });
});

// Auto assign (সেরা স্কোরের member)
router.post("/tasks/:id/auto-assign", async (req, res) => {
  const taskId = Number(req.params.id);
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "PENDING") return res.status(400).json({ error: "শুধু PENDING টাস্ক auto-assign হয়" });

  const top = await getSuggestions(taskId, 1);
  if (!top || top.length === 0) return res.status(400).json({ error: "কোনো যোগ্য member পাওয়া যায়নি" });
  await doAssign(taskId, top[0].userId, top[0].score, top[0].breakdown);
  await log(req, "TASK_AUTO_ASSIGNED", `${task.title} → ${top[0].name}`);
  res.json({ ok: true, assignedTo: top[0].name });
});

export default router;