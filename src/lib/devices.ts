export interface Device {
  name: string;
  sn: string;
  dn: string;
  measurementType: string;
  department: string;
  color: string;
}

// Centralized department color palette
export const DEPARTMENT_COLORS: Record<string, string> = {
  Production:     "#10B981", // Emerald green
  Infrastructure: "#3B82F6", // Blue
  Administration: "#F59E0B", // Amber / orange
};

export const DEVICES: Device[] = [
  { 
    name: "Laboratoire",    
    sn: "sn-13-10833", 
    dn: "dn-13-10833", 
    measurementType: "electrical", 
    department: "Production",     
    color: "#10B981" 
  },
  { 
    name: "TGBT Principal", 
    sn: "sn-13-11386", 
    dn: "dn-13-11386", 
    measurementType: "electrical", 
    department: "Infrastructure", 
    color: "#3B82F6" 
  },
  { 
    name: "Administration", 
    sn: "sn-13-11390", 
    dn: "dn-13-11390", 
    measurementType: "electrical", 
    department: "Administration", 
    color: "#F59E0B" 
  },
  { 
    name: "Compresseur",    
    sn: "sn-13-11405", 
    dn: "dn-13-11405", 
    measurementType: "electrical", 
    department: "Production",     
    color: "#8B5CF6" 
  },
  { 
    name: "ECL Zone 40",    
    sn: "sn-13-11407", 
    dn: "dn-13-11407", 
    measurementType: "electrical", 
    department: "Infrastructure", 
    color: "#06B6D4" 
  },
  { 
    name: "Chaudière",      
    sn: "sn-13-11653", 
    dn: "dn-13-15005", 
    measurementType: "electrical", 
    department: "Production",     
    color: "#EF4444" 
  },
  { 
    name: "Blending",       
    sn: "sn-13-15015", 
    dn: "dn-13-15015", 
    measurementType: "electrical", 
    department: "Production",     
    color: "#F97316" 
  },
];

export const DEPARTMENTS = [...new Set(DEVICES.map(d => d.department))];

/* ── Water Devices ────────────────────────────────────────────────────────── */

export const WATER_DEVICES: Device[] = [
  {
    name: "Général",
    sn: "sn-39-10171",
    dn: "dn-39-10171",
    measurementType: "water",
    department: "Infrastructure",
    color: "#0EA5E9",
  },
];

export const WATER_DEPARTMENTS = [...new Set(WATER_DEVICES.map(d => d.department))];

/** Returns the department color for a given device name or dn. Falls back to neutral grey. */
export function getDeviceColor(deviceIdentifier: string): string {
  const allDevices = [...DEVICES, ...WATER_DEVICES];
  return allDevices.find(d => d.name === deviceIdentifier || d.dn === deviceIdentifier)?.color ?? "#6B7280";
}
