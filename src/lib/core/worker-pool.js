/**
 * Multithreaded Web Worker Pool Manager
 * Handles hardware concurrency, offscreen canvas processing, and background thread execution.
 */

function resolveWorkerUrl(filename = 'worker.js') {
  if (typeof window === 'undefined') return `assets/js/${filename}`;
  try {
    const baseUrl = window.location.href.split('#')[0].split('?')[0];
    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return new URL(`assets/js/${filename}`, baseDir).href;
  } catch (e) {
    return `assets/js/${filename}`;
  }
}

export class WorkerPoolManager {
  constructor(workerPath = resolveWorkerUrl(), maxWorkers = 4) {
    this.workerPath = workerPath;
    const concurrency = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    this.poolSize = Math.max(1, Math.min(concurrency, maxWorkers));
    this.workers = [];
    this.busyWorkers = new Set();
    this.workerTaskMap = new Map(); // worker -> taskId
    this.queue = [];
    this.isSupported = typeof Worker !== 'undefined';
    this.isAvailable = false;
    this.hasOffscreenCanvas = false;
    this.initPromise = null;
    this.taskIdCounter = 0;
    this.pendingCallbacks = new Map();
  }

  init() {
    if (this.initPromise) return this.initPromise;
    if (!this.isSupported) {
      console.warn('[WorkerPool] Web Workers not supported in this environment, using main thread fallback');
      this.isAvailable = false;
      this.initPromise = Promise.resolve(false);
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        for (let i = 0; i < this.poolSize; i++) {
          const worker = new Worker(this.workerPath);
          worker.onmessage = (e) => this._handleMessage(e, worker);
          worker.onerror = (err) => this._handleError(err, worker);
          this.workers.push(worker);
        }

        const pingResult = await this._pingWorker(this.workers[0]);
        if (pingResult && pingResult.pong) {
          this.isAvailable = true;
          this.hasOffscreenCanvas = !!pingResult.hasOffscreenCanvas;
          console.log(`[WorkerPool] Active with ${this.workers.length} threads (OffscreenCanvas: ${this.hasOffscreenCanvas})`);
        } else {
          console.warn('[WorkerPool] Ping failed, disabling workers');
          this.terminate();
          this.isAvailable = false;
        }
      } catch (err) {
        console.warn('[WorkerPool] Initialization failed (e.g. file:// or CSP policy), using main thread fallback:', err);
        this.terminate();
        this.isAvailable = false;
      }
      return this.isAvailable;
    })();

    return this.initPromise;
  }

  _pingWorker(worker) {
    return new Promise((resolve) => {
      const id = ++this.taskIdCounter;
      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        resolve(null);
      }, 3500);

      this.pendingCallbacks.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: () => {
          clearTimeout(timeout);
          resolve(null);
        }
      });

      try {
        worker.postMessage({ id, type: 'ping' });
      } catch (e) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  _handleMessage(e, worker) {
    const { id, success, error, fallback, ...rest } = e.data || {};
    this.busyWorkers.delete(worker);
    this.workerTaskMap.delete(worker);

    const cb = this.pendingCallbacks.get(id);
    if (cb) {
      this.pendingCallbacks.delete(id);
      if (success) {
        cb.resolve(rest);
      } else {
        cb.reject(new Error(error || (fallback ? 'WORKER_FALLBACK' : 'Worker task failed')));
      }
    }

    this._drainQueue();
  }

  _handleError(err, worker) {
    console.warn('[WorkerPool] Worker error:', err);
    this.busyWorkers.delete(worker);
    const taskId = this.workerTaskMap.get(worker);
    if (taskId) {
      this.workerTaskMap.delete(worker);
      const cb = this.pendingCallbacks.get(taskId);
      if (cb) {
        this.pendingCallbacks.delete(taskId);
        cb.reject(new Error(err && err.message ? err.message : 'Worker execution error'));
      }
    }
    this._drainQueue();
  }

  _drainQueue() {
    while (this.queue.length > 0) {
      const idleWorker = this.workers.find((w) => !this.busyWorkers.has(w));
      if (!idleWorker) break;

      const task = this.queue.shift();
      this._executeOnWorker(idleWorker, task);
    }
  }

  _executeOnWorker(worker, task) {
    this.busyWorkers.add(worker);
    this.workerTaskMap.set(worker, task.id);
    const { id, type, payload, transferables, resolve, reject, timeoutId } = task;
    this.pendingCallbacks.set(id, { resolve, reject, timeoutId, worker });
    try {
      worker.postMessage({ id, type, payload }, transferables || []);
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      this.busyWorkers.delete(worker);
      this.workerTaskMap.delete(worker);
      this.pendingCallbacks.delete(id);
      reject(err);
    }
  }

  async runTask(type, payload, transferables = [], timeoutMs = 30000) {
    if (this.initPromise && !this.isAvailable) {
      await this.initPromise;
    }
    if (!this.isAvailable) {
      throw new Error('WORKER_UNAVAILABLE');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.taskIdCounter;
      let timeoutId = null;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          const cb = this.pendingCallbacks.get(id);
          if (cb) {
            this.pendingCallbacks.delete(id);
            if (cb.worker) {
              this.busyWorkers.delete(cb.worker);
              this.workerTaskMap.delete(cb.worker);
            }
            cb.reject(new Error(`Worker task timed out after ${timeoutMs}ms`));
            this._drainQueue();
          }
        }, timeoutMs);
      }

      const task = {
        id,
        type,
        payload,
        transferables,
        timeoutId,
        resolve: (val) => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(val);
        },
        reject: (err) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(err);
        }
      };

      const idleWorker = this.workers.find((w) => !this.busyWorkers.has(w));
      if (idleWorker) {
        this._executeOnWorker(idleWorker, task);
      } else {
        this.queue.push(task);
      }
    });
  }

  async encodeImageOffscreen(options = {}, timeoutMs = 30000) {
    if (this.initPromise && !this.isAvailable) {
      await this.initPromise;
    }
    if (!this.isAvailable || !this.hasOffscreenCanvas) {
      throw new Error('WORKER_OFFSCREEN_UNAVAILABLE');
    }
    const transferables = [];
    if (options.bitmap) transferables.push(options.bitmap);
    if (options.imageBuffer) transferables.push(options.imageBuffer);
    if (options.buffer) transferables.push(options.buffer);
    return await this.runTask('encode-image', options, transferables, timeoutMs);
  }

  terminate() {
    this.workers.forEach((w) => {
      try { w.terminate(); } catch (e) {}
    });
    this.workers = [];
    this.busyWorkers.clear();
    this.workerTaskMap.clear();
    this.queue.forEach((t) => {
      if (t.timeoutId) clearTimeout(t.timeoutId);
      t.reject(new Error('Worker terminated'));
    });
    this.queue = [];
    this.pendingCallbacks.forEach((cb) => {
      if (cb.timeoutId) clearTimeout(cb.timeoutId);
      cb.reject(new Error('Worker terminated'));
    });
    this.pendingCallbacks.clear();
    this.isAvailable = false;
    this.initPromise = null;
  }
}

export const appWorkerPool = new WorkerPoolManager('assets/js/worker.js');
appWorkerPool.init().catch(() => {});

if (typeof window !== 'undefined') {
  window.PDF_TOOLS_WORKER_POOL = appWorkerPool;
  window.WorkerPoolManager = WorkerPoolManager;
}
