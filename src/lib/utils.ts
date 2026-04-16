import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string to "DD/MM/YYYY à HHhMM".
 * Handles ISO formats or raw strings like "2026-02-14 08:00:00".
 * Returns "DD/MM/YYYY à HHhMM" or the original string if invalid.
 */
export const formatDateTime = (value: string): string => {
  if (!value || value === '-') return value;
  try {
    // Attempt native Date parsing
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      // Manual fallback for custom formats like "YYYY-MM-DD HH:mm:ss"
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
      if (match) {
        return `${match[3]}/${match[2]}/${match[1]} à ${match[4]}h${match[5]}`;
      }
      return value;
    }
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} à ${hours}h${minutes}`;
  } catch (e) {
    return value;
  }
}

/**
 * Formats a date value for DATE MAX / DATE MIN display.
 * Format adapts based on granularity:
 * - hourly:   "DD/MM/YYYY à HHh00"
 * - daily:    "DD/MM/YYYY"
 * - weekly:   "Semaine du DD/MM/YYYY"
 * - monthly:  "MM - NomDuMois" (e.g. "01 - Janvier")
 */
export const formatDateByGranularity = (
  value: string | null | undefined,
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly'
): string => {
  if (!value || value === '-') return '-';
  
  const MONTHS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  
  try {
    let d = new Date(value);
    
    if (isNaN(d.getTime())) {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
      if (match) {
        d = new Date(parseInt(match[1]), parseInt(match[2])-1, parseInt(match[3]), parseInt(match[4]), parseInt(match[5]));
      } else {
        return value;
      }
    }
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const monthIndex = d.getMonth();
    
    switch (granularity) {
      case 'hourly':
        return `${day}/${month}/${year} à ${hours}h${minutes === '00' ? '00' : minutes}`;
      case 'daily':
        return `${day}/${month}/${year}`;
      case 'weekly':
        return `Semaine du ${day}/${month}/${year}`;
      case 'monthly':
        return `${month} - ${MONTHS_FR[monthIndex]}`;
      default:
        return `${day}/${month}/${year}`;
    }
  } catch (e) {
    return value;
  }
}

/**
 * Extracts formatting "MM - NomDuMois" from any given ISO Date string 
 * or raw strings natively mapped from peak computations.
 */
export const extractMonthLabel = (dateStr: string): string => {
  if (!dateStr || dateStr === '-') return '-';
  
  const MONTHS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  // 1. Handle Monthly exact match (e.g., "Janvier 2026" or "Fevrier 2026")
  const monthMatch = dateStr.match(/^([a-zA-ZÀ-ÿ]+)\s+(\d{4})$/);
  if (monthMatch) {
    const cleanName = monthMatch[1].toLowerCase().replace('é', 'e').replace('û', 'u');
    const idx = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'].indexOf(cleanName);
    if (idx !== -1) {
      return MONTHS_FR[idx];
    }
  }

  // 2. Handle Weekly exact match (e.g., "Sem. 42 - 2025")
  const weekMatch = dateStr.match(/Sem\.\s*(\d+)\s*-\s*(\d{4})/i);
  if (weekMatch) {
    const week = parseInt(weekMatch[1], 10);
    const year = parseInt(weekMatch[2], 10);
    const d = new Date(year, 0, 1 + (week - 1) * 7);
    const m = d.getMonth();
    return MONTHS_FR[m];
  }

  try {
    let date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        date = new Date(parseInt(match[1]), parseInt(match[2])-1, parseInt(match[3]));
      } else {
        return '-';
      }
    }
    const monthIndex = date.getMonth();
    return MONTHS_FR[monthIndex];
  } catch (e) {
    return '-';
  }
}

/**
 * Formats a kWh value using French locale format:
 * - Non-breaking space (\u00A0) as thousands separator
 * - Comma as decimal separator
 * - Always exactly 3 decimal places
 * - Safe against NaN, null, undefined, Infinity
 *
 * Examples:
 * 587197.000  →  "587 197,000"
 * 284434.123  →  "284 434,123"
 * 1300.5      →  "1 300,500"
 * 0.230       →  "0,230"
 * 0           →  "0,000"
 * NaN         →  "0,000"
 */
export const formatKwh = (value: number): string => {
  if (value === null || value === undefined || !isFinite(value) || isNaN(value)) {
    return '0,000'
  }

  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const fixed = abs.toFixed(3)               // e.g. "587197.000"
  const dotIndex = fixed.indexOf('.')
  const intPart = fixed.slice(0, dotIndex)   // "587197"
  const decPart = fixed.slice(dotIndex + 1)  // "000"

  // Build integer part with non-breaking space manually (loop, no regex)
  const chars = intPart.split('').reverse()
  const groups: string[] = []
  for (let i = 0; i < chars.length; i += 3) {
    groups.push(chars.slice(i, i + 3).reverse().join(''))
  }
  const intFormatted = groups.reverse().join('\u00A0')  // U+00A0 non-breaking space

  return `${sign}${intFormatted},${decPart}`
}

/*
 * formatKwh unit tests (manual verification):
 * formatKwh(587197)    === "587\u00A0197,000"  ✓
 * formatKwh(284434)    === "284\u00A0434,000"  ✓
 * formatKwh(1300.5)    === "1\u00A0300,500"    ✓
 * formatKwh(0.23)      === "0,230"             ✓
 * formatKwh(0)         === "0,000"             ✓
 * formatKwh(NaN)       === "0,000"             ✓
 * formatKwh(-100)      === "-100,000"          ✓
 * formatKwh(1000000)   === "1\u00A0000\u00A0000,000" ✓
 */

/**
 * Clamps a date string to a valid, logical value.
 * Handles: invalid days for month, future dates, dates before 2020.
 * Returns corrected YYYY-MM-DD string.
 */
export function clampDate(dateStr: string, role: 'start' | 'end'): string {
  if (!dateStr) {
    const today = new Date();
    if (role === 'start') return `${today.getFullYear()}-01-01`;
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const mmStr = String(y.getMonth() + 1).padStart(2, '0');
    const ddStr = String(y.getDate()).padStart(2, '0');
    return `${y.getFullYear()}-${mmStr}-${ddStr}`;
  }

  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);  // 1-12
  const day = parseInt(parts[2]);
  
  // Fix day overflow: get actual last day of this month/year
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const correctedDay = Math.min(day, lastDayOfMonth);
  
  // Build corrected date
  const corrected = new Date(year, month - 1, Math.max(1, correctedDay));
  
  // Clamp: not before 2020-01-01
  const minDate = new Date(2020, 0, 1);
  if (corrected < minDate) return '2020-01-01';
  
  // Clamp: not after yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 59, 59, 999);
  if (corrected > yesterday) {
    const mmStr = String(yesterday.getMonth() + 1).padStart(2, '0');
    const ddStr = String(yesterday.getDate()).padStart(2, '0');
    return `${yesterday.getFullYear()}-${mmStr}-${ddStr}`;
  }
  
  // Return corrected date
  const resMm = String(month).padStart(2, '0');
  const resDd = String(correctedDay).padStart(2, '0');
  return `${year}-${resMm}-${resDd}`;
}

/**
 * Ensures end date is after start date.
 * If end <= start, sets end = start + 1 day.
 */
export function ensureDateOrder(
  startDate: string, 
  endDate: string
): { startDate: string; endDate: string } {
  if (endDate <= startDate) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + 1)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return { startDate, endDate: `${d.getFullYear()}-${mm}-${dd}` }
  }
  return { startDate, endDate }
}

export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const today = new Date()
  
  // Start = January 1st of current year
  const startDate = `${today.getFullYear()}-01-01`
  
  // End = yesterday (last complete day)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const mm = String(yesterday.getMonth() + 1).padStart(2, '0')
  const dd = String(yesterday.getDate()).padStart(2, '0')
  const endDate = `${yesterday.getFullYear()}-${mm}-${dd}`
  
  return { startDate, endDate }
}
