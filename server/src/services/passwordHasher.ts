import { Worker } from 'worker_threads';
import { createRequire } from 'module';
import os from 'os';

// bcrypt off the main thread. bcryptjs is pure JavaScript: a cost-12 hash
// holds the event loop for ~400 ms, so while anyone signed in, every other
// request on the server waited (load test: 2.6 sign-ins/s at most, and 4 at
// once stalled unrelated requests by up to 1.2 s). A small pool of worker
// threads runs bcryptjs instead — same library, same `$2b$` hashes, so stored
// hashes keep working and no native module has to build on the host.

const require = createRequire(import.meta.url);
const BCRYPT_PATH = require.resolve('bcryptjs');

const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const bcrypt = require(workerData.bcryptPath);
parentPort.on('message', async ({ id, op, a, b }) => {
  try {
    const result = op === 'hash' ? await bcrypt.hash(a, b) : await bcrypt.compare(a, b);
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
`;

/** Thrown when more sign-ins are waiting than the pool should queue. */
export class HasherBusyError extends Error {
  constructor() { super('Password hashing queue is full'); this.name = 'HasherBusyError'; }
}

type Op = 'hash' | 'compare';
interface Task { id: number; op: Op; a: string; b: string | number; resolve: (v: unknown) => void; reject: (e: Error) => void }
interface Slot { worker: Worker; task: Task | null }

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// At least 2 even on a fractional-CPU host: the OS then shares the CPU, but
// the event loop is never the one waiting
const POOL_SIZE = envInt('BCRYPT_WORKERS', Math.max(2, Math.min(4, os.availableParallelism())));
// ~0.4 s each, so a full queue is several seconds of sign-ins. Past that a
// burst is answered "busy, try again" instead of every request timing out
const MAX_QUEUE = envInt('BCRYPT_MAX_QUEUE', 100);

const slots: Slot[] = [];
const queue: Task[] = [];
let nextId = 1;

function spawn(): Slot {
  const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { bcryptPath: BCRYPT_PATH } });
  worker.unref(); // never keeps the process (or a test run) alive
  const slot: Slot = { worker, task: null };
  worker.on('message', (msg: { id: number; result?: unknown; error?: string }) => {
    const task = slot.task;
    slot.task = null;
    worker.unref();
    if (task && task.id === msg.id) {
      if (msg.error !== undefined) task.reject(new Error(msg.error));
      else task.resolve(msg.result);
    }
    pump();
  });
  const replace = (err: Error) => {
    const i = slots.indexOf(slot);
    if (i === -1) return;
    slots.splice(i, 1);
    slot.task?.reject(err);
    slot.task = null;
    pump();
  };
  worker.on('error', replace);
  worker.on('exit', (code) => replace(new Error(`Password worker exited (${code})`)));
  slots.push(slot);
  return slot;
}

function pump(): void {
  while (queue.length) {
    let slot = slots.find(s => !s.task);
    if (!slot && slots.length < POOL_SIZE) slot = spawn();
    if (!slot) return;
    const task = queue.shift()!;
    slot.task = task;
    slot.worker.ref(); // keep the process up while a hash is in flight
    slot.worker.postMessage({ id: task.id, op: task.op, a: task.a, b: task.b });
  }
}

function run<T>(op: Op, a: string, b: string | number): Promise<T> {
  if (queue.length >= MAX_QUEUE) return Promise.reject(new HasherBusyError());
  return new Promise<T>((resolve, reject) => {
    queue.push({ id: nextId++, op, a, b, resolve: resolve as (v: unknown) => void, reject });
    pump();
  });
}

/** Same signatures as bcryptjs: `hash(secret, rounds)`, `compare(secret, hash)`. */
const passwordHasher = {
  hash: (secret: string, rounds: number): Promise<string> => run<string>('hash', secret, rounds),
  compare: (secret: string, hash: string): Promise<boolean> => run<boolean>('compare', secret, hash),
};

export default passwordHasher;
