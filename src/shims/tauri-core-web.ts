export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/invoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cmd, args: args || {} }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `invoke failed: ${cmd}`);
  }

  return payload.result as T;
}
