import { prisma } from "./prisma";

// Member-এর কাজের ধাপ (Accepted, Submitted ইত্যাদি) audit log-এর ঘটনা হিসেবে রাখা হয়।
// detail-এর ফরম্যাট: "<taskId>|<তথ্য>|<তথ্য>"
export const FLOW_ACTIONS = [
  "TASK_ACCEPTED",
  "TASK_STARTED",
  "TASK_PROGRESS",
  "TASK_SUBMITTED",
  "TASK_APPROVED",
  "TASK_REJECTED",
  "TASK_REASSIGN_REQUEST",
  "TASK_REASSIGN_DECLINED",
  "TASK_DONE",
];

export type Ev = { action: string; detail: string | null; createdAt: Date };

export type Stage =
  | "PENDING"
  | "ASSIGNED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "COMPLETED"
  | "CANCELLED";

export type Flow = {
  stage: Stage;
  progress: number;
  acceptedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  submitNote: string | null;
  completedAt: string | null;
  lastReview: { decision: "APPROVED" | "REJECTED"; note: string; at: string } | null;
  reassign: { reason: string; at: string } | null;
  reassignDeclined: string | null;
};

export const taskIdOf = (e: Ev) => Number((e.detail ?? "").split("|")[0]);
const part = (e: Ev, from: number) => (e.detail ?? "").split("|").slice(from).join("|");
const ms = (d: Date) => d.getTime();

export async function eventsFor(taskIds: number[]): Promise<Ev[]> {
  if (taskIds.length === 0) return [];
  return prisma.auditLog.findMany({
    where: {
      action: { in: FLOW_ACTIONS },
      OR: taskIds.map((id) => ({ detail: { startsWith: `${id}|` } })),
    },
    orderBy: { createdAt: "asc" },
  });
}

// একটি assignment-এর বর্তমান অবস্থা (শুধু ওই assignment-এর পরের ঘটনা ধরা হয়)
export function flowOf(task: { id: number; status: string }, assignedAt: Date, all: Ev[]): Flow {
  const evs = all
    .filter((e) => taskIdOf(e) === task.id && ms(e.createdAt) >= ms(assignedAt))
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const last = (...actions: string[]) => [...evs].reverse().find((e) => actions.includes(e.action));
  const iso = (e?: Ev) => (e ? e.createdAt.toISOString() : null);

  const accepted = last("TASK_ACCEPTED");
  const started = last("TASK_STARTED");
  const submitted = last("TASK_SUBMITTED");
  const rejected = last("TASK_REJECTED");
  const done = last("TASK_DONE");
  const progressEv = last("TASK_PROGRESS");

  let stage: Stage;
  if (task.status === "PENDING") stage = "PENDING";
  else if (task.status === "CANCELLED") stage = "CANCELLED";
  else if (task.status === "DONE") stage = "COMPLETED";
  else if (task.status === "IN_PROGRESS") {
    stage = submitted && (!rejected || ms(rejected.createdAt) < ms(submitted.createdAt)) ? "SUBMITTED" : "IN_PROGRESS";
  } else stage = accepted ? "ACCEPTED" : "ASSIGNED";

  let progress = 0;
  if (stage === "COMPLETED" || stage === "SUBMITTED") progress = 100;
  else if (stage === "IN_PROGRESS" && progressEv) {
    progress = Math.max(0, Math.min(100, Number((progressEv.detail ?? "").split("|")[1]) || 0));
  }

  const review = last("TASK_APPROVED", "TASK_REJECTED");
  const req = last("TASK_REASSIGN_REQUEST");
  const dec = last("TASK_REASSIGN_DECLINED");
  const declinedAfterReq = !!(req && dec && ms(dec.createdAt) > ms(req.createdAt));
  const canRequest = ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(stage);

  return {
    stage,
    progress,
    acceptedAt: iso(accepted),
    startedAt: iso(started),
    submittedAt: iso(submitted),
    submitNote: submitted ? part(submitted, 1) || null : null,
    completedAt: iso(done),
    lastReview: review
      ? { decision: review.action === "TASK_APPROVED" ? "APPROVED" : "REJECTED", note: part(review, 2), at: review.createdAt.toISOString() }
      : null,
    reassign: req && !declinedAfterReq && canRequest ? { reason: part(req, 1), at: req.createdAt.toISOString() } : null,
    reassignDeclined: declinedAfterReq && dec ? part(dec, 1) || "অনুরোধ গ্রহণ করা হয়নি" : null,
  };
}