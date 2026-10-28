export type DeviceHealth = {
  sensor?: "ok" | "warning" | "error" | string;
  camera?: "ok" | "warning" | "error" | string;
  printer?: "ok" | "warning" | "error" | string;
  barrier?: "ok" | "warning" | "error" | string;
};

export type ParkingDevice = {
  id: number;
  deviceCode: string;
  name: string;
  deviceType: "gate" | "cashier" | "controller" | "camera" | "printer" | "sensor";
  status: "active" | "inactive" | "maintenance";
  area: string | null;
  gateDirection: "in" | "out" | null;
  cameraUrl: string | null;
  cameraSnapshotUrl: string | null;
  capabilities: {
    cameraDeviceCode?: string;
    printerDeviceCode?: string;
    health?: DeviceHealth;
    [key: string]: unknown;
  };
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OutputType = ParkingDevice[];

export async function getParkingDevices(): Promise<OutputType> {
  const response = await fetch("/api/parking/devices", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as OutputType | { error?: string };
  if (!response.ok) {
    throw new Error(
      (body as { error?: string }).error || "Gagal memuat perangkat.",
    );
  }
  return Array.isArray(body) ? body : [];
}
