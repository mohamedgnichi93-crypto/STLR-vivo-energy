export interface Device {
  name: string;
  sn: string;
  dn: string;
  measurementType: string;
  department: string;
}

export const DEVICES: Device[] = [
  { name: "Laboratoire", sn: "sn-13-10833", dn: "dn-13-10833", measurementType: "electrical", department: "Production" },
  { name: "TGBT Principal", sn: "sn-13-11386", dn: "dn-13-11386", measurementType: "electrical", department: "Infrastructure" },
  { name: "Administration", sn: "sn-13-11390", dn: "dn-13-11390", measurementType: "electrical", department: "Administration" },
  { name: "Compresseur", sn: "sn-13-11405", dn: "dn-13-11405", measurementType: "electrical", department: "Production" },
  { name: "ECL Zone 40", sn: "sn-13-11407", dn: "dn-13-11407", measurementType: "electrical", department: "Production" },
  { name: "Chaudière", sn: "sn-13-11653", dn: "dn-13-15005", measurementType: "electrical", department: "Production" },
  { name: "Blending", sn: "sn-13-15015", dn: "dn-13-15015", measurementType: "electrical", department: "Production" },
];

export const DEPARTMENTS = [...new Set(DEVICES.map(d => d.department))];

// Fixed color per department — consistent across ALL charts
export const DEPARTMENT_COLORS: Record<string, string> = {
  Production: "hsl(155 60% 52%)",      // Emerald green
  Infrastructure: "hsl(200 70% 55%)",  // Sky blue
  Administration: "hsl(35 90% 55%)",   // Amber
};

// Get color for a device based on its department
export function getDeviceColor(deviceName: string): string {
  const device = DEVICES.find(d => d.name === deviceName);
  if (!device) return "hsl(240 4% 55%)";
  return DEPARTMENT_COLORS[device.department] || "hsl(240 4% 55%)";
}
