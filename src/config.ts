import { readFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

function loadSecrets(): Record<string, string> {
  // Em producao: usa env vars direto
  // Em dev: carrega .secrets
  if (process.env.DISCORD_BOT_TOKEN) {
    return process.env as Record<string, string>
  }

  const secretsPath = resolve(homedir(), '.secrets/emailhacker')
  try {
    const content = readFileSync(secretsPath, 'utf-8')
    const secrets: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      secrets[key] = value
    }
    return secrets
  } catch {
    console.error('No .secrets file and no env vars — exiting')
    process.exit(1)
  }
}

const secrets = loadSecrets()

export const config = {
  botToken: secrets.DISCORD_BOT_TOKEN || '',
  clientId: secrets.DISCORD_CLIENT_ID || '',
  guildId: secrets.DISCORD_GUILD_ID || '',
  botSecret: secrets.DISCORD_BOT_SECRET || secrets.EMAILHACKER_API_TOKEN || '',

  roleNewcomer: secrets.DISCORD_ROLE_NEWCOMER || '',
  roleMember: secrets.DISCORD_ROLE_MEMBER || '',
  roleOG: secrets.DISCORD_ROLE_OG || '',

  channelGatekeeper: secrets.DISCORD_CHANNEL_GATEKEEPER || '',
  channelGeneral: secrets.DISCORD_CHANNEL_GENERAL || '',

  apiBaseUrl: secrets.API_BASE_URL || 'http://localhost:1337',

  acAccount: secrets.AC_LASCHUK_ACCOUNT || '',
  acApiKey: secrets.AC_LASCHUK_API_KEY || '',

  supabaseUrl: secrets.SUPABASE_URL || '',
  supabaseServiceKey: secrets.SUPABASE_SERVICE_ROLE_KEY || '',
}
