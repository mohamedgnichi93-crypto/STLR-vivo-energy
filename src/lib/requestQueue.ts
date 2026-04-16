import { FetchResult } from "./api";

type Priority = 'high' | 'normal' | 'low';

interface QueueItem {
  id: string;           // cache key: stlr_${dn}_${start}_${end}_${gran}
  dn: string;
  startDate: string;
  endDate: string;
  granularity: string;
  priority: Priority;
  execute: () => Promise<FetchResult>;
  resolve: (result: FetchResult) => void;
  reject: (error: Error) => void;
}

/**
 * Priority request queue — processes high priority items first.
 * Respects concurrency limit (max 2 parallel requests at once).
 * Re-prioritizes automatically when priority changes.
 */
export class RequestQueue {
  private queue: QueueItem[] = [];
  private running = 0;
  private maxConcurrent = 2; // never more than 2 parallel API calls

  /**
   * Add a request to the queue.
   * If same id already exists, update its priority instead of adding duplicate.
   */
  enqueue(item: Omit<QueueItem, 'resolve' | 'reject'>): Promise<FetchResult> {
    return new Promise<FetchResult>((resolve, reject) => {
      // Check if item with same ID already exists
      const existingIndex = this.queue.findIndex(existing => existing.id === item.id);
      
      if (existingIndex !== -1) {
        // Update priority of existing item
        const existing = this.queue[existingIndex];
        if (this.comparePriority(item.priority, existing.priority) > 0) {
          existing.priority = item.priority;
          // Re-sort queue
          this.sortQueue();
          console.log(`[Queue] Upgraded priority: ${item.dn} → ${item.priority}`);
        }
        // Replace resolve/reject handlers
        existing.resolve = resolve;
        existing.reject = reject;
      } else {
        // Add new item
        const queueItem: QueueItem = {
          ...item,
          resolve,
          reject
        };
        this.queue.push(queueItem);
        this.sortQueue();
        console.log(`[Queue] Enqueued: ${item.dn} (priority: ${item.priority})`);
      }

      // Process next item if we have capacity
      this.processNext();
    });
  }

  /**
   * Upgrade priority of an existing queued item.
   * Used when user selects a device that's already waiting in queue.
   */
  setPriority(id: string, priority: Priority): void {
    const item = this.queue.find(item => item.id === id);
    if (item && this.comparePriority(priority, item.priority) > 0) {
      item.priority = priority;
      this.sortQueue();
      console.log(`[Queue] Set priority: ${item.dn} → ${priority}`);
    }
  }

  /**
   * Cancel all pending low-priority requests.
   * Called when user changes date range entirely.
   */
  cancelLowPriority(): void {
    const lowPriorityItems = this.queue.filter(item => item.priority === 'low');
    lowPriorityItems.forEach(item => {
      item.reject(new Error('Request cancelled due to priority change'));
    });
    this.queue = this.queue.filter(item => item.priority !== 'low');
    console.log(`[Queue] Cancelled ${lowPriorityItems.length} low-priority requests`);
  }

  /**
   * Get current queue status for debugging.
   */
  getStatus(): { queued: number; running: number; items: Array<{id: string; priority: Priority}> } {
    return {
      queued: this.queue.length,
      running: this.running,
      items: this.queue.map(item => ({
        id: item.id,
        priority: item.priority
      }))
    };
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => this.comparePriority(b.priority, a.priority));
  }

  private comparePriority(a: Priority, b: Priority): number {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    return priorityOrder[a] - priorityOrder[b];
  }

  private processNext(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.running >= this.maxConcurrent || this.queue.length === 0) {
        resolve();
        return;
      }

      const item = this.queue.shift()!;
      this.running++;

      console.log(`[Queue] Processing ${item.dn} (priority: ${item.priority}) — ${this.running}/${this.maxConcurrent} slots used`);

      item.execute()
        .then(result => {
          item.resolve(result);
          console.log(`[Queue] Completed: ${item.dn}`);
        })
        .catch(error => {
          item.reject(error as Error);
          console.error(`[Queue] Failed: ${item.dn}`, error);
        })
        .finally(() => {
          this.running--;
          // Process next item
          this.processNext().then(() => resolve());
        });
    });
  }
}

// Singleton instance — shared across the entire app
export const requestQueue = new RequestQueue();
