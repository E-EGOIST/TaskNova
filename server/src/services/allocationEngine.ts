import { prisma } from "../lib/prisma";

const WEIGHTS = { skill: 0.5, workload: 0.25, availability: 0.15, experience: 0.1 };
const MIN_SKILL_MATCH = 0.3;
const EXPERIENCE_CAP = 5;

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export async function getSuggestions(taskId: number, limit = 3) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { skills: true },
  });
  if (!task) return null;

  const members = await prisma.user.findMany({
    where: { role: "MEMBER" },
    include: {
      skills: true,
      availability: true,
      assignments: { include: { task: true } },
    },
  });

  const now = new Date();
  const results = [];

  for (const m of members) {
    // 1. Skill match
    let skillMatch = 1;
    if (task.skills.length > 0) {
      const parts = task.skills.map((req) => {
        const has = m.skills.find((s) => s.skillId === req.skillId);
        if (!has) return 0;
        return Math.min(has.proficiency / req.minLevel, 1);
      });
      skillMatch = parts.reduce((a, b) => a + b, 0) / parts.length;
    }
    if (skillMatch < MIN_SKILL_MATCH) continue; // অযোগ্য, বাদ

    // 2. Workload: চলমান (ASSIGNED / IN_PROGRESS) টাস্কের ঘণ্টা
    const activeHours = m.assignments
      .filter((a) => ["ASSIGNED", "IN_PROGRESS"].includes(a.task.status))
      .reduce((sum, a) => sum + a.task.estimatedHours, 0);
    const workload = clamp(1 - activeHours / m.maxHoursPerWeek);

    // 3. Availability: এখন থেকে deadline পর্যন্ত leave-এর দিন বাদে অনুপাত
    const totalMs = Math.max(task.deadline.getTime() - now.getTime(), 1);
    let leaveMs = 0;
    for (const a of m.availability) {
      if (a.type !== "LEAVE") continue;
      const start = Math.max(a.start.getTime(), now.getTime());
      const end = Math.min(a.end.getTime(), task.deadline.getTime());
      if (end > start) leaveMs += end - start;
    }
    const availability = clamp(1 - leaveMs / totalMs);

    // 4. Experience: আগে শেষ করা টাস্ক
    const done = m.assignments.filter((a) => a.task.status === "DONE").length;
    const experience = clamp(done / EXPERIENCE_CAP);

    const score =
      WEIGHTS.skill * skillMatch +
      WEIGHTS.workload * workload +
      WEIGHTS.availability * availability +
      WEIGHTS.experience * experience;

    results.push({
      userId: m.id,
      name: m.name,
      score: Number(score.toFixed(4)),
      breakdown: {
        skillMatch: Number(skillMatch.toFixed(3)),
        workload: Number(workload.toFixed(3)),
        availability: Number(availability.toFixed(3)),
        experience: Number(experience.toFixed(3)),
        weights: WEIGHTS,
      },
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}