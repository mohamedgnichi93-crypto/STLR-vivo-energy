const WARN_THRESHOLD = 0.80;   // 80% → warn + prune old data
const CRITICAL_THRESHOLD = 0.95;  // 95% → aggressive prune

/**
 * Returns current storage usage using the Storage API.
 * Falls back to size estimation if Storage API unavailable.
 */
export async function getStorageQuota(): Promise<{
  usedMB: number;
  totalMB: number;
  percentUsed: number;
  isNearLimit: boolean;    // true if > 80%
  isCritical: boolean;     // true if > 95%
}> {
  try {
    const estimate = await navigator.storage.estimate();
    const usedBytes = estimate.usage ?? 0;
    const quotaBytes = estimate.quota ?? 500 * 1024 * 1024; // 500MB fallback
    
    const usedMB = usedBytes / 1024 / 1024;
    const totalMB = quotaBytes / 1024 / 1024;
    const percentUsed = usedBytes / quotaBytes;
    
    return {
      usedMB,
      totalMB,
      percentUsed,
      isNearLimit: percentUsed > WARN_THRESHOLD,
      isCritical: percentUsed > CRITICAL_THRESHOLD
    };
  } catch (error) {
    console.warn('[Storage] Storage API not available, using fallback');
    // Fallback values
    const totalMB = 500;
    return {
      usedMB: 0,
      totalMB,
      percentUsed: 0,
      isNearLimit: false,
      isCritical: false
    };
  }
}

/**
 * Checks storage usage and prunes if needed.
 * Called automatically before every IndexedDB write.
 * 
 * Pruning strategy (in order):
 * 1. Delete entries older than 1 year (keep recent 365 days)
 * 2. If still critical: delete entries older than 6 months
 * 3. If still critical: delete entries older than 3 months
 * 4. If still critical: throw StorageFullError
 */
export async function enforceStorageBudget(): Promise<void> {
  const quota = await getStorageQuota();
  
  if (!quota.isNearLimit && !quota.isCritical) {
    return; // Storage is healthy, no action needed
  }
  
  console.log(`[Storage] Usage: ${quota.usedMB.toFixed(1)}MB / ${quota.totalMB.toFixed(1)}MB (${(quota.percentUsed * 100).toFixed(1)}%)`);
  
  // Import here to avoid circular dependency
  const { pruneOldEntries, getAllIndexedDBEntries } = await import('./indexedDbCache');
  
  const pruningStrategies = [
    { days: 365, description: '1 year' },
    { days: 180, description: '6 months' },
    { days: 90, description: '3 months' }
  ];
  
  for (const strategy of pruningStrategies) {
    if (quota.isCritical || (quota.isNearLimit && strategy.days === 365)) {
      await pruneOldEntries(strategy.days);
      
      // Re-check quota after pruning
      const newQuota = await getStorageQuota();
      if (!newQuota.isCritical) {
        console.log('[Storage] Pruning successful, storage is now safe');
        return;
      }
    }
  }
  
  // If still critical after all pruning attempts
  const finalQuota = await getStorageQuota();
  if (finalQuota.isCritical) {
    throw new StorageFullError(finalQuota.usedMB, finalQuota.totalMB);
  }
}

/**
 * Returns a human-readable storage report.
 */
export async function getStorageReport(): Promise<{
  usedMB: number;
  totalMB: number;
  percentUsed: number;
  entryCount: number;
  oldestEntry: string;    // YYYY-MM-DD
  newestEntry: string;    // YYYY-MM-DD
  recommendation: string; // e.g. "Storage healthy" or "Consider pruning data older than 1 year"
}> {
  const quota = await getStorageQuota();
  const { getAllIndexedDBEntries } = await import('./indexedDbCache');
  
  const entries = await getAllIndexedDBEntries();
  const entryCount = entries.length;
  
  // Find oldest and newest entries
  const dates = entries.map(e => e.endDate).filter(Boolean);
  const oldestEntry = dates.length > 0 ? Math.min(...dates.map(d => new Date(d).getTime())) : 0;
  const newestEntry = dates.length > 0 ? Math.max(...dates.map(d => new Date(d).getTime())) : 0;
  
  const oldestEntryStr = oldestEntry > 0 ? new Date(oldestEntry).toISOString().split('T')[0] : 'N/A';
  const newestEntryStr = newestEntry > 0 ? new Date(newestEntry).toISOString().split('T')[0] : 'N/A';
  
  let recommendation: string;
  if (quota.isCritical) {
    recommendation = 'Storage critical - immediate cleanup required';
  } else if (quota.isNearLimit) {
    recommendation = 'Storage nearly full - consider pruning data older than 1 year';
  } else {
    recommendation = 'Storage healthy';
  }
  
  return {
    usedMB: quota.usedMB,
    totalMB: quota.totalMB,
    percentUsed: quota.percentUsed,
    entryCount,
    oldestEntry: oldestEntryStr,
    newestEntry: newestEntryStr,
    recommendation
  };
}

/**
 * Custom error thrown when storage cannot be freed enough.
 */
export class StorageFullError extends Error {
  constructor(usedMB: number, totalMB: number) {
    super(`Storage full: ${usedMB.toFixed(1)}MB / ${totalMB.toFixed(1)}MB used`);
    this.name = 'StorageFullError';
  }
}
