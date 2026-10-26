import { eventsFor, flowOf } from "../lib/workflow";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { getSuggestions } from "../services/allocationEngine";

const router = Router();
router.use(requireAuth, requireRole("ADMIN", "MANAGER"));

/* ---------- helpers ---------- */

// Manager-এর নিজের team (managerId = তার id)। কেউ না থাকলে সব সক্রিয় member।
async function teamOf(userId: number) {
  const own = await prisma.user.findMany({
    where: { role: "MEMBER", isActive: true, managerId: userId },
    select: { id: true },
  });
  if (own.length > 0) return { ids: own.map((u: { id: number }) => u.id), all: false };
  const every = await prisma.user.findMany({
    where: { role: "MEMBER", isActive: true },
    select: { id: true },
  });
  return { ids: every.map((u: { id: number }) => u.id), all: true };
}

type Team = { ids: number[]; all: boolean };

// টাস্কটি এই manager-এর আওতায় আছে কি না
async function taskInScope(taskId: number, userId: number, team: Team) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignments: { where: { active: true } } },
  });
  if (!task) return null;
  const mine =
    team.all ||
    task.createdById === userId ||
    task.assignments.some((a: { userId: number }) => team.ids.includes(a.userId));
  return mine ? task : null;
}

async function log(req: Request, action: string, detail?: string) {
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
  await prisma.auditLog
    .create({ data: { userId: req.user!.id, userName: me?.name, action, detail } })
    .catch(() => {});
}

const skillList = z
  .array(z.object({ skillId: z.number().int(), minLevel: z.number().int().min(1).max(5).default(1) }))
  .default([]);

function uniqSkills(list: { skillId: number; minLevel: number }[]) {
  return Array.from(new Map(list.map((s) => [s.skillId, s])).values());
}

/* ---------- overview ---------- */
router.get("/overview", async (req, res) => {
  const uid = req.user!.id;
  const team = await teamOf(uid);

  const [me, members, skills] = await Promise.all([
    prisma.user.findUnique({ where: { id: uid }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { id: { in: team.ids } },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, email: true, maxHoursPerWeek: true,
        department: { select: { name: true } },
        skills: { include: { skill: true } },
      },
    }),
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
  ]);

  const tasks = await prisma.task.findMany({
    where: team.all
      ? {}
      : { OR: [{ createdById: uid }, { assignments: { some: { active: true, userId: { in: team.ids } } } }] },
    orderBy: { createdAt: "desc" },
    include: { skills: { include: { skill: true } } },
  });
  const taskIds: number[] = tasks.map((t: { id: number }) => t.id);

  const [assignments, leaves, doneLogs] = await Promise.all([
    prisma.assignment.findMany({
      where: { taskId: { in: taskIds } },
      orderBy: { assignedAt: "desc" },
      include: { user: { select: { id: true, name: true } }, task: { select: { title: true } } },
    }),
    prisma.availability.findMany({
      where: { type: "LEAVE", userId: { in: team.ids }, end: { gte: new Date() } },
      orderBy: { start: "asc" },
    }),
    prisma.auditLog.findMany({ where: { action: "TASK_DONE" }, orderBy: { createdAt: "asc" }, take: 3000 }),
  ]);

  // কোন টাস্ক কখন DONE হয়েছে (audit log থেকে)
  const doneAt: Record<number, string> = {};
  for (const l of doneLogs as { detail: string | null; createdAt: Date }[]) {
    const id = Number((l.detail ?? "").split("|")[0]);
    if (id && taskIds.includes(id)) doneAt[id] = l.createdAt.toISOString();
  }

  res.json({ me, allMembers: team.all, members, tasks, assignments, leaves, skills, doneAt });
});

/* ---------- task CRUD ---------- */
const createBody = z.object({
  title: z.string().min(2),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  estimatedHours: z.number().positive(),
  deadline: z.string().datetime(),
  category: z.string().nullable().optional(),
  difficulty: z.number().int().min(1).max(5).default(3),
  skills: skillList,
});

router.post("/tasks", async (req, res) => {
  const p = createBody.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const { skills, deadline, ...data } = p.data;
  try {
    const t = await prisma.task.create({
      data: {
        ...data,
        deadline: new Date(deadline),
        createdById: req.user!.id,
        skills: { create: uniqSkills(skills) },
      },
    });
    await log(req, "TASK_CREATED", t.title);
    res.status(201).json(t);
  } catch {
    res.status(400).json({ error: "Could not create task (check skill)" });
  }
});

// defaults ছাড়া আলাদা schema, যাতে PATCH-এ না-পাঠানো ঘর অজান্তে রিসেট না হয়
const patchBody = z.object({
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
  const p = patchBody.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  const team = await teamOf(req.user!.id);
  if (!(await taskInScope(id, req.user!.id, team))) return res.status(404).json({ error: "Task not found" });

  const { skills, deadline, ...rest } = p.data;
  try {
    const t = await prisma.$transaction(async (tx: typeof prisma) => {
      const updated = await tx.task.update({
        where: { id },
        data: { ...rest, ...(deadline ? { deadline: new Date(deadline) } : {}) },
      });
      if (skills) {
        await tx.taskSkill.deleteMany({ where: { taskId: id } });
        const list = uniqSkills(skills);
        if (list.length) await tx.taskSkill.createMany({ data: list.map((s) => ({ taskId: id, ...s })) });
      }
      return updated;
    });
    await log(req, "TASK_UPDATED", t.title);
    res.json(t);
  } catch {
    res.status(400).json({ error: "Could not update task (check skill)" });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  const id = Number(req.params.id);
  const team = await teamOf(req.user!.id);
  const task = await taskInScope(id, req.user!.id, team);
  if (!task) return res.status(404).json({ error: "Task not found" });
  await prisma.task.delete({ where: { id } });
  await log(req, "TASK_DELETED", task.title);
  res.json({ ok: true });
});

/* ---------- allocation ---------- */
router.get("/tasks/:id/suggestions", async (req, res) => {
  const id = Number(req.params.id);
  const team = await teamOf(req.user!.id);
  if (!(await taskInScope(id, req.user!.id, team))) return res.status(404).json({ error: "Task not found" });
  const all = (await getSuggestions(id, 500)) ?? [];
  res.json(all.filter((s) => team.ids.includes(s.userId)));
});

async function doAssign(taskId: number, userId: number, score: number, breakdown: object) {
  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.assignment.updateMany({ where: { taskId, active: true }, data: { active: false } });
    await tx.task.update({ where: { id: taskId }, data: { status: "ASSIGNED" } });
    await tx.assignment.create({ data: { taskId, userId, score, scoreBreakdown: breakdown } });
  });
}

// Manual assign / reassign (শুধু নিজের team-এর সক্রিয় member)
router.post("/tasks/:id/assign", async (req, res) => {
  const id = Number(req.params.id);
  const p = z.object({ userId: z.number().int() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "userId required" });

  const team = await teamOf(req.user!.id);
  const task = await taskInScope(id, req.user!.id, team);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (["DONE", "CANCELLED"].includes(task.status)) {
    return res.status(400).json({ error: "সম্পন্ন বা বাতিল টাস্ক assign করা যায় না" });
  }
  if (!team.ids.includes(p.data.userId)) {
    return res.status(400).json({ error: "এই member আপনার টিমে নেই" });
  }
  const target = await prisma.user.findUnique({ where: { id: p.data.userId }, select: { name: true } });

  const all = (await getSuggestions(id, 500)) ?? [];
  const pick = all.find((s) => s.userId === p.data.userId);
  await doAssign(id, p.data.userId, pick?.score ?? 0, pick?.breakdown ?? { manual: true });
  await log(req, task.status === "PENDING" ? "TASK_ASSIGNED" : "TASK_REASSIGNED", `${task.title} → ${target?.name}`);
  res.json({ ok: true });
});

router.post("/tasks/:id/auto-assign", async (req, res) => {
  const id = Number(req.params.id);
  const team = await teamOf(req.user!.id);
  const task = await taskInScope(id, req.user!.id, team);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "PENDING") return res.status(400).json({ error: "শুধু PENDING টাস্ক auto-assign হয়" });

  const all = ((await getSuggestions(id, 500)) ?? []).filter((s) => team.ids.includes(s.userId));
  if (all.length === 0) return res.status(400).json({ error: "টিমে কোনো যোগ্য member পাওয়া যায়নি" });
  await doAssign(id, all[0].userId, all[0].score, all[0].breakdown);
  await log(req, "TASK_AUTO_ASSIGNED", `${task.title} → ${all[0].name}`);
  res.json({ ok: true, assignedTo: all[0].name });
});

/* ---------- workload balance প্রস্তাব ---------- */
router.get("/balance", async (req, res) => {
  const team = await teamOf(req.user!.id);
  const THRESHOLD = 0.8;

  const members = await prisma.user.findMany({
    where: { id: { in: team.ids } },
    select: { id: true, name: true, maxHoursPerWeek: true },
  });
  const cap = new Map<number, number>(members.map((m: { id: number; maxHoursPerWeek: number }) => [m.id, m.maxHoursPerWeek]));
  const names = new Map<number, string>(members.map((m: { id: number; name: string }) => [m.id, m.name]));

  const active = await prisma.assignment.findMany({
    where: { active: true, userId: { in: team.ids }, task: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } } },
    include: { task: true },
  });

  const hours = new Map<number, number>(team.ids.map((i) => [i, 0]));
  for (const a of active as { userId: number; task: { estimatedHours: number } }[]) {
    hours.set(a.userId, (hours.get(a.userId) ?? 0) + a.task.estimatedHours);
  }
  const util = (id: number) => (hours.get(id) ?? 0) / (cap.get(id) ?? 40);

  const proposals: {
    taskId: number; title: string; hours: number; fromId: number; fromName: string;
    toId: number; toName: string; score: number;
  }[] = [];

  for (const m of members as { id: number; name: string }[]) {
    if (util(m.id) <= THRESHOLD) continue;
    const movable = (active as { userId: number; taskId: number; task: { title: string; status: string; estimatedHours: number } }[])
      .filter((a) => a.userId === m.id && a.task.status === "ASSIGNED")
      .sort((a, b) => b.task.estimatedHours - a.task.estimatedHours);

    for (const a of movable) {
      if (util(m.id) <= THRESHOLD) break;
      const sugg = ((await getSuggestions(a.taskId, 500)) ?? []).filter(
        (s) => s.userId !== m.id && team.ids.includes(s.userId)
      );
      const best = sugg
        .map((s) => ({ s, after: ((hours.get(s.userId) ?? 0) + a.task.estimatedHours) / (cap.get(s.userId) ?? 40) }))
        .filter((x) => x.after <= THRESHOLD)
        .sort((x, y) => x.after - y.after || y.s.score - x.s.score)[0];
      if (!best) continue;

      proposals.push({
        taskId: a.taskId, title: a.task.title, hours: a.task.estimatedHours,
        fromId: m.id, fromName: m.name, toId: best.s.userId, toName: names.get(best.s.userId) ?? best.s.name,
        score: best.s.score,
      });
      hours.set(m.id, (hours.get(m.id) ?? 0) - a.task.estimatedHours);
      hours.set(best.s.userId, (hours.get(best.s.userId) ?? 0) + a.task.estimatedHours);
    }
  }
  res.json(proposals);
});
/* ---------- Review queue ---------- */
router.get("/reviews", async (req, res) => {
  const uid = req.user!.id;
  const team = await teamOf(uid);

  const active = await prisma.assignment.findMany({
    where: {
      active: true,
      task: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      ...(team.all ? {} : { OR: [{ userId: { in: team.ids } }, { task: { createdById: uid } }] }),
    },
    include: { task: true, user: { select: { id: true, name: true } } },
  });
  const events = await eventsFor(active.map((a: { taskId: number }) => a.taskId));

  const submitted: object[] = [];
  const requests: object[] = [];
  for (const a of active) {
    const f = flowOf(a.task, a.assignedAt, events);
    const base = {
      taskId: a.taskId, title: a.task.title, deadline: a.task.deadline,
      estimatedHours: a.task.estimatedHours, assignee: a.user,
    };
    if (f.stage === "SUBMITTED") {
      submitted.push({ ...base, submittedAt: f.submittedAt, note: f.submitNote });
    }
    if (f.reassign) requests.push({ ...base, reason: f.reassign.reason, at: f.reassign.at, stage: f.stage });
  }

  const members = await prisma.user.findMany({
    where: { id: { in: team.ids } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  res.json({ submitted, requests, members });
});

router.post("/tasks/:id/review", async (req, res) => {
  const id = Number(req.params.id);
  const p = z
    .object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().max(500).optional() })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });

  const team = await teamOf(req.user!.id);
  const task = await taskInScope(id, req.user!.id, team);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const a = await prisma.assignment.findFirst({ where: { taskId: id, active: true } });
  if (!a) return res.status(400).json({ error: "কোনো সক্রিয় assignment নেই" });
  const f = flowOf(task, a.assignedAt, await eventsFor([id]));
  if (f.stage !== "SUBMITTED") return res.status(400).json({ error: "এই টাস্ক এখন review-এর অবস্থায় নেই" });

  const text = p.data.note ?? "";
  if (p.data.decision === "APPROVE") {
    await prisma.task.update({ where: { id }, data: { status: "DONE" } });
    await prisma.auditLog
      .create({ data: { userId: a.userId, action: "TASK_DONE", detail: `${id}|${task.title}` } })
      .catch(() => {});
    await log(req, "TASK_APPROVED", `${id}|${task.title}|${text}`);
  } else {
    await log(req, "TASK_REJECTED", `${id}|${task.title}|${text}`);
  }
  res.json({ ok: true });
});

router.post("/tasks/:id/decline-reassign", async (req, res) => {
  const id = Number(req.params.id);
  const p = z.object({ note: z.string().max(500).optional() }).safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: "Invalid input" });

  const team = await teamOf(req.user!.id);
  const task = await taskInScope(id, req.user!.id, team);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const a = await prisma.assignment.findFirst({ where: { taskId: id, active: true } });
  if (!a) return res.status(400).json({ error: "কোনো সক্রিয় assignment নেই" });
  const f = flowOf(task, a.assignedAt, await eventsFor([id]));
  if (!f.reassign) return res.status(400).json({ error: "কোনো পেন্ডিং অনুরোধ নেই" });

  await log(req, "TASK_REASSIGN_DECLINED", `${id}|${p.data.note ?? ""}`);
  res.json({ ok: true });
});
export default router;