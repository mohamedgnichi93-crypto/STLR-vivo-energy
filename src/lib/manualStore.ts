// Storage keys
const DEVICES_KEY = 'stlr_manual_devices'
const ENTRIES_KEY = 'stlr_manual_data'

/**
 * Represents a user-defined device for manual readings.
 */
export interface ManualDevice {
  id: string
  name: string
  type: 'electricity' | 'water'
  unit: 'kWh' | 'm³'
  createdAt: string
}

/**
 * Represents a single manual data point linked to a device.
 */
export interface ManualEntry {
  id: string
  deviceId: string
  date: string        // YYYY-MM-DD
  value: number
  createdAt: string
}

// Helper: Get from localStorage
function getFromStorage<T>(key: string): T[] {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : []
}

// Helper: Save to localStorage
function saveToStorage<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

// Device operations
export function getAllDevices(): ManualDevice[] {
  return getFromStorage<ManualDevice>(DEVICES_KEY)
}

export function getDevicesByType(type: 'electricity' | 'water'): ManualDevice[] {
  return getAllDevices().filter(d => d.type === type)
}

export function getDeviceById(id: string): ManualDevice | null {
  return getAllDevices().find(d => d.id === id) || null
}

export function addDevice(device: Omit<ManualDevice, 'id' | 'createdAt'>): ManualDevice {
  const devices = getAllDevices()
  const newDevice: ManualDevice = {
    ...device,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  }
  saveToStorage(DEVICES_KEY, [...devices, newDevice])
  return newDevice
}

export function deleteDevice(id: string): void {
  // 1. Delete device
  const devices = getAllDevices().filter(d => d.id !== id)
  saveToStorage(DEVICES_KEY, devices)

  // 2. Delete ALL its entries
  const entries = getAllEntries().filter(e => e.deviceId !== id)
  saveToStorage(ENTRIES_KEY, entries)
}

// Entry operations
export function getAllEntries(): ManualEntry[] {
  return getFromStorage<ManualEntry>(ENTRIES_KEY)
}

export function getEntriesByDevice(deviceId: string): ManualEntry[] {
  return getAllEntries().filter(e => e.deviceId === deviceId)
}

export function addEntry(entry: Omit<ManualEntry, 'id' | 'createdAt'>): ManualEntry {
  const entries = getAllEntries()
  const newEntry: ManualEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  }
  saveToStorage(ENTRIES_KEY, [...entries, newEntry])
  return newEntry
}

export function updateEntry(id: string, value: number): ManualEntry {
  const entries = getAllEntries()
  const idx = entries.findIndex(e => e.id === id)
  if (idx === -1) throw new Error('Entry not found')
  
  entries[idx] = { ...entries[idx], value }
  saveToStorage(ENTRIES_KEY, entries)
  return entries[idx]
}

export function deleteEntry(id: string): void {
  const entries = getAllEntries().filter(e => e.id !== id)
  saveToStorage(ENTRIES_KEY, entries)
}

export function getEntryByDeviceAndDate(
  deviceId: string,
  date: string
): ManualEntry | null {
  const entries = getAllEntries()
  return entries.find(
    e => e.deviceId === deviceId && e.date === date
  ) ?? null
}

export function upsertEntry(
  entry: Omit<ManualEntry, 'id' | 'createdAt'>
): { action: 'created' | 'updated' } {
  const existing = getEntryByDeviceAndDate(entry.deviceId, entry.date)
  if (existing) {
    updateEntry(existing.id, entry.value)
    return { action: 'updated' }
  } else {
    addEntry(entry)
    return { action: 'created' }
  }
}

import type { RawConsumptionPoint } from './types'

/**
 * Transforms ManualEntry[] for a specific device into RawConsumptionPoint[]
 * compatible with all existing chart components.
 * Maps entry.value → phaseA and total (phaseB/C = 0)
 */
export function transformManualEntriesToRawPoints(
  deviceId: string,
  startDate: string,
  endDate: string
): RawConsumptionPoint[] {
  const entries = getEntriesByDevice(deviceId)
  return entries
    .filter(e => e.date >= startDate && e.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => ({
      date: entry.date,
      phaseA: entry.value,
      phaseB: 0,
      phaseC: 0,
      total: entry.value
    }))
}

/**
 * Returns all manual devices of a given type with their 
 * transformed data for a date range.
 */
export function getManualDeviceData(
  type: 'electricity' | 'water',
  startDate: string,
  endDate: string
): Array<{ device: ManualDevice; points: RawConsumptionPoint[] }> {
  const devices = getDevicesByType(type)
  return devices.map(device => ({
    device,
    points: transformManualEntriesToRawPoints(device.id, startDate, endDate)
  }))
}
