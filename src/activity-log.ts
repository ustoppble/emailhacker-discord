import { createHash } from 'crypto'
import { config } from './config'

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16)
}

export async function logActivity(
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  if (!config.supabaseUrl) return

  const serialized = JSON.stringify(metadata)
  const safeMetadata = serialized.length > 2000
    ? { _truncated: true, action }
    : metadata

  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/activity_log`, {
      method: 'POST',
      headers: {
        'apikey': config.supabaseServiceKey,
        'Authorization': `Bearer ${config.supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        source: 'discord',
        action,
        metadata: safeMetadata,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[ACT] Erro ao registrar ${action}: ${res.status} — ${text}`)
    }
  } catch (err) {
    console.error(`[ACT] Erro ao registrar ${action}:`, err)
  }
}
