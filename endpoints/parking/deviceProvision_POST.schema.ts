export async function postParkingDeviceProvision(input: {
  deviceId: string;
}): Promise<{ deviceCode: string; secret: string }> {
  const response = await fetch("/api/parking/deviceProvision", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as {
    deviceCode?: string;
    secret?: string;
    error?: string;
  };
  if (!response.ok || !body.deviceCode || !body.secret) {
    throw new Error(body.error || "Gagal membuat kredensial perangkat.");
  }
  return { deviceCode: body.deviceCode, secret: body.secret };
}
