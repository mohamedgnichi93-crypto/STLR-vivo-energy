import { RawConsumptionPoint } from "./types";

/**
 * Computes a fast non-cryptographic checksum of a data array.
 * Used to detect cache corruption.
 * 
 * Algorithm: FNV-1a (fast, deterministic, no external deps)
 * Returns: 8-character hex string e.g. "a3f2b891"
 */
export function computeChecksum(data: RawConsumptionPoint[]): string {
  const str = JSON.stringify(data);
  let hash = 2166136261; // FNV offset basis
  
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, keep as uint32
  }
  
  return hash.toString(16).padStart(8, '0');
}

/**
 * Verifies data against a stored checksum.
 * Returns true if data is intact, false if corrupted.
 */
export function verifyChecksum(
  data: RawConsumptionPoint[], 
  storedChecksum: string
): boolean {
  const computedChecksum = computeChecksum(data);
  return computedChecksum === storedChecksum;
}
