import type { Client } from 'discord.js'
import { config } from './config'

const WORKER_ID = 'discord'
const INTERVAL_MS = 60_000

async function sendHeartbeat(client: Client): Promise<void> {
  if (!config.supabaseUrl) return

  try {
    const res = await fetch(
      `${config.supabaseUrl}/rest/v1/worker_heartbeats?on_conflict=worker_id`,
      {
        method: 'POST',
        headers: {
          'apikey': config.supabaseServiceKey,
          'Authorization': `Bearer ${config.supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          worker_id: WORKER_ID,
          last_seen_at: new Date().toISOString(),
          status: 'running',
          metadata: {
            guilds: client.guilds.cache.size,
            uptime: Math.floor(process.uptime()),
          },
        }),
      }
    )
    if (!res.ok) {
      const text = await res.text()
      console.error(`[ZERO] heartbeat falhou: ${res.status} — ${text}`)
    }
  } catch (err) {
    console.error('[ZERO] heartbeat erro:', err)
  }
}

export function startHeartbeat(client: Client): void {
  void sendHeartbeat(client)
  setInterval(() => void sendHeartbeat(client), INTERVAL_MS)
}
