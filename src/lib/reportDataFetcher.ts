import { checkAllCaches, saveToAppropriateCache } from './cacheManager';
import { getDevicesByType, getEntriesByDevice } from './manualStore';
import { DEVICES, WATER_DEVICES } from './devices';
import { fetchDeviceRawData, fetchWaterDeviceRawData } from './api';
import { Granularity, Phase, aggregateToWeekly, aggregateToMonthly } from './types';

export interface ReportDeviceEntry {
  dn: string;
  name: string;
  total: number;
  daily: { 
    date: string; 
    value: number;   // = selected phase value
    phaseA: number;
    phaseB: number;
    phaseC: number;
    total: number;
  }[];
}

interface RawPoint {
  date?: string;
  timestamp?: string;
  value?: number;
  total?: number;
  phaseA?: number;
  phaseB?: number;
  phaseC?: number;
}

const extractPhaseValue = (p: RawPoint, ph: Phase): number => {
  if (ph === 'phaseA') return p.phaseA ?? 0;
  if (ph === 'phaseB') return p.phaseB ?? 0;
  if (ph === 'phaseC') return p.phaseC ?? 0;
  return p.total ?? p.value ?? 0;
};

export const REPORT_PALETTE = [
  '#10b981','#3b82f6','#f59e0b','#8b5cf6','#ef4444',
  '#06b6d4','#f97316','#ec4899','#14b8a6','#6366f1','#84cc16','#a855f7'
];

export function getReportColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return REPORT_PALETTE[Math.abs(hash) % REPORT_PALETTE.length];
}

export type ReportSource = 'wattnow_elec' | 'wattnow_water' | 'electricity' | 'water';

export async function fetchReportData(
  source: ReportSource,
  startDate: string,
  endDate: string,
  phase: Phase = 'total',
  granularity: Granularity = 'daily'
): Promise<ReportDeviceEntry[]> {
  
  // 1. Hourly check for manual data
  if ((source === 'electricity' || source === 'water') && granularity === 'hourly') {
    return [];
  }

  // Granularity aggregation helper (used by multiple branches below)
  const applyGranularity = (entries: ReportDeviceEntry[]): ReportDeviceEntry[] => {
    if (granularity === 'daily' || granularity === 'hourly') {
      return entries;
    }
    
    return entries.map(device => {
      const aggPoints: { date: string; value: number }[] = granularity === 'weekly' 
        ? aggregateToWeekly(device.daily.map(p => ({ date: p.date, value: p.value })))
        : aggregateToMonthly(device.daily.map(p => ({ date: p.date, value: p.value })));
      
      const newDaily = aggPoints.map(p => ({
        date: p.date,
        value: p.value,
        phaseA: 0,
        phaseB: 0,
        phaseC: 0,
        total: p.value
      }));

      return {
        ...device,
        daily: newDaily,
        total: newDaily.reduce((s, p) => s + p.value, 0)
      };
    });
  };

  // 2. WattNow Eau — fetch real water device data
  if (source === 'wattnow_water') {
    const waterResults: ReportDeviceEntry[] = [];

    for (const device of WATER_DEVICES) {
      try {
        const waterCacheKey = `water_${device.dn}`;
        const cached = await checkAllCaches(waterCacheKey, startDate, endDate, granularity === 'hourly' ? 'hourly' : 'daily');
        let points: ReportDeviceEntry['daily'] = [];

        if (cached && cached.data) {
          points = (cached.data as RawPoint[]).map((p) => ({
            date: (p.date || p.timestamp || '').substring(0, 19),
            value: p.total ?? p.value ?? 0,
            phaseA: 0,
            phaseB: 0,
            phaseC: 0,
            total: p.total ?? p.value ?? 0,
          }));
        } else {
          const result = await fetchWaterDeviceRawData(
            device.dn,
            startDate,
            endDate,
            granularity === 'hourly' ? 'hourly' : 'daily'
          );
          if (result && result.data) {
            points = (result.data as RawPoint[]).map((p) => ({
              date: (p.date || p.timestamp || '').substring(0, 19),
              value: p.total ?? p.value ?? 0,
              phaseA: 0,
              phaseB: 0,
              phaseC: 0,
              total: p.total ?? p.value ?? 0,
            }));
          }
        }

        waterResults.push({
          dn: device.dn,
          name: device.name,
          total: points.reduce((s, p) => s + p.value, 0),
          daily: points.sort((a, b) => a.date.localeCompare(b.date)),
        });
      } catch (err) {
        console.error(`Error fetching water report data for ${device.dn}:`, err);
        waterResults.push({ dn: device.dn, name: device.name, total: 0, daily: [] });
      }
    }

    return applyGranularity(waterResults);
  }

  const results: ReportDeviceEntry[] = [];

  if (source === 'wattnow_elec') {
    const failedDns: string[] = [];
    const internalGranularity = granularity === 'hourly' ? 'hourly' : 'daily';
    
    for (const device of DEVICES) {
      try {
        const cached = await checkAllCaches(device.dn, startDate, endDate, internalGranularity);
        let points: ReportDeviceEntry['daily'] = [];
        
        if (cached && cached.data) {
          points = (cached.data as RawPoint[]).map((p) => ({
            date: (p.date || p.timestamp || '').substring(0, 19), // keep time for hourly
            value: extractPhaseValue(p, phase),
            phaseA: p.phaseA ?? 0,
            phaseB: p.phaseB ?? 0,
            phaseC: p.phaseC ?? 0,
            total: p.total ?? p.value ?? 0
          }));
        } else {
          const result = await fetchDeviceRawData(device.dn, startDate, endDate, internalGranularity);
          if (result && result.data) {
            points = (result.data as RawPoint[]).map((p) => ({
              date: (p.date || p.timestamp || '').substring(0, 19),
              value: extractPhaseValue(p, phase),
              phaseA: p.phaseA ?? 0,
              phaseB: p.phaseB ?? 0,
              phaseC: p.phaseC ?? 0,
              total: p.total ?? p.value ?? 0
            }));
            await saveToAppropriateCache(device.dn, startDate, endDate, internalGranularity, result.data);
          }
        }
        
        results.push({
          dn: device.dn,
          name: device.name,
          total: points.reduce((s, p) => s + p.value, 0),
          daily: points.sort((a, b) => a.date.localeCompare(b.date))
        });
      } catch (err) {
        console.error(`Error fetching report data for ${device.dn}:`, err);
        failedDns.push(device.dn);
        results.push({ dn: device.dn, name: device.name, total: 0, daily: [] });
      }
    }

    if (failedDns.length === DEVICES.length) {
      throw new Error('Impossible de charger les données pour tous les appareils');
    }
  } else {
    const type = source === 'electricity' ? 'electricity' : 'water';
    const devices = getDevicesByType(type);
    
    devices.forEach(device => {
      const entries = getEntriesByDevice(device.id)
        .filter(e => e.date >= startDate && e.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date));
      
      results.push({
        dn: device.id,
        name: device.name,
        total: entries.reduce((s, e) => s + e.value, 0),
        daily: entries.map(e => ({ 
          date: e.date, 
          value: e.value,
          phaseA: 0,
          phaseB: 0,
          phaseC: 0,
          total: e.value 
        }))
      });
    });
  }

  return applyGranularity(results);
}
