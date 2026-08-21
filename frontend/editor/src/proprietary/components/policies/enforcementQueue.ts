/**
 * Serial enforcement queue. Every policy enforcement — before export, before
 * print, before a convert/extract, and (later) as files arrive — runs through
 * here, one at a time. The backend rejects concurrent policy runs under load,
 * and a single in-flight run keeps the queue the user sees honest.
 *
 * Jobs carry their {@link EnforcementTrigger} and a status so the UI can show
 * what's pending/running. Input enforcement reuses this contract unchanged: it
 * just submits jobs with `trigger: "input"`.
 */
import { useSyncExternalStore } from "react";

export type EnforcementTrigger = "export" | "print" | "convert" | "input";
export type EnforcementStatus = "pending" | "running" | "done" | "failed";

export interface EnforcementJob {
  id: string;
  /** Human-readable label, e.g. the policy/file name, shown in the queue UI. */
  label: string;
  trigger: EnforcementTrigger;
  status: EnforcementStatus;
}

/** How long a finished job lingers in the list before it's dropped. */
const DONE_LINGER_MS = 2500;

type Listener = () => void;
const listeners = new Set<Listener>();
let jobs: EnforcementJob[] = [];
// The tail of the serial chain — each new job runs after this resolves.
let tail: Promise<unknown> = Promise.resolve();
let seq = 0;

function emit() {
  for (const listener of listeners) listener();
}

function setStatus(id: string, status: EnforcementStatus) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, status } : j));
  emit();
}

function scheduleRemoval(id: string) {
  setTimeout(() => {
    jobs = jobs.filter((j) => j.id !== id);
    emit();
  }, DONE_LINGER_MS);
}

/**
 * Run `task` after every job queued before it has finished, tracking its status
 * for the UI. The returned promise resolves/rejects with the task's result, so
 * callers can `await runQueued(...)` exactly as they would the bare work.
 */
export function runQueued<T>(
  meta: { label: string; trigger: EnforcementTrigger },
  task: () => Promise<T>,
): Promise<T> {
  const id = `enf-${++seq}`;
  jobs = [
    ...jobs,
    { id, label: meta.label, trigger: meta.trigger, status: "pending" },
  ];
  emit();

  const run = tail.then(async () => {
    setStatus(id, "running");
    try {
      const result = await task();
      setStatus(id, "done");
      return result;
    } catch (error) {
      setStatus(id, "failed");
      throw error;
    } finally {
      scheduleRemoval(id);
    }
  });

  // Keep the chain alive when a task rejects so the next job still runs; callers
  // still see the rejection through `run`.
  tail = run.catch(() => {});
  return run;
}

export function getQueueJobs(): EnforcementJob[] {
  return jobs;
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React view of the live queue (pending + running + briefly-lingering jobs). */
export function useEnforcementQueue(): EnforcementJob[] {
  return useSyncExternalStore(subscribeQueue, getQueueJobs, getQueueJobs);
}
