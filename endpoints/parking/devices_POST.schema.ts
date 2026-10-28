import type { ParkingDevice } from "./devices_GET.schema";

export type DevicePayload = {
  action: "create" | "update" | "setStatus";
  id?: string | number;
  deviceCode: string;
  name: string;
  deviceType: "gate" | "cashier" | "controller" | "camera" | "printer" | "sensor";
  status: "active" | "inactive" | "maintenance";
  area?: string | null;
  gateDirection?: "in" | "out" | "" | null;
  cameraUrl?: string | null;
  cameraSnapshotUrl?: string | null;
  capabilities?: {
    cameraDeviceCode?: string;
    printerDeviceCode?: string;
    [key: string]: unknown;
  };
};

export type SetStatusPayload = {
  action: "setStatus";
  id: string | number;
  status: "active" | "inactive" | "maintenance";
  capabilities?: Record<string, unknown>;
};

export async function postParkingDevice(
  payload: DevicePayload | SetStatusPayload,
): Promise<ParkingDevice> {
  const response = await fetch("/api/parking/devices", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as ParkingDevice | { error?: string };
  if (!response.ok) {
    throw new Error(
      (body as { error?: string }).error || "Gagal menyimpan perangkat.",
    );
  }
  return body as ParkingDevice;
}
