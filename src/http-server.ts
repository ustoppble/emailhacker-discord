import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Client } from 'discord.js'
import { config } from './config'
import { sessions, startOnboarding } from './handlers/onboarding'
import {
  getOnboardingRecord,
  listPendingOnboardings,
  fetchOnboardingRows,
  OnboardingRecord,
} from './services/supabase'
import { logActivity } from './activity-log'

const startedAt = Date.now()

const BRT_OFFSET_HOURS = 3 // America/Sao_Paulo = UTC-3 fixo desde 2019 (sem DST)

function brtToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function brtDayStartUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, BRT_OFFSET_HOURS, 0, 0))
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime())
}

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { client: Client; params: Record<string, string> }
) => Promise<void> | void

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  auth: boolean
  handler: Handler
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function compile(method: string, path: string, auth: boolean, handler: Handler): Route {
  const keys: string[] = []
  const pattern = new RegExp(
    '^' +
      path.replace(/:[^/]+/g, (m) => {
        keys.push(m.slice(1))
        return '([^/]+)'
      }) +
      '$'
  )
  return { method, pattern, keys, auth, handler }
}

function toMemberSummary(r: OnboardingRecord & { created_at?: string; updated_at?: string }) {
  return {
    discord_id: r.discord_id,
    username: r.discord_username,
    status: r.status,
    current_step: r.current_step,
    created_at: (r as { created_at?: string }).created_at ?? null,
    last_activity_at: (r as { updated_at?: string }).updated_at ?? null,
  }
}

const routes: Route[] = [
  compile('GET', '/health', false, (_req, res) => {
    json(res, 200, {
      status: 'ok',
      uptime_s: Math.floor((Date.now() - startedAt) / 1000),
      members_in_flight: sessions.size,
    })
  }),

  compile('GET', '/members/pending', true, async (_req, res) => {
    const rows = await listPendingOnboardings()
    json(res, 200, rows.map(toMemberSummary))
  }),

  compile('GET', '/members/:discordId/status', true, async (_req, res, { params }) => {
    const row = await getOnboardingRecord(params.discordId)
    if (!row) return json(res, 404, { error: 'not_found' })
    const { discord_id, discord_username, status, current_step, ...rest } = row
    const createdAt = (row as { created_at?: string }).created_at ?? null
    const gateCompletedAt = (row as { gate_completed_at?: string }).gate_completed_at ?? null
    json(res, 200, {
      discord_id,
      username: discord_username,
      status,
      current_step,
      gate_completed_at: gateCompletedAt,
      created_at: createdAt,
      answers: {
        name: rest.name,
        email: rest.email,
        whatsapp: rest.whatsapp,
        nivel_tecnico: rest.nivel_tecnico,
        ferramentas: rest.ferramentas,
        objetivo: rest.objetivo,
        faixa_renda: rest.faixa_renda,
        maior_dificuldade: rest.maior_dificuldade,
        como_conheceu: rest.como_conheceu,
        o_que_quer: rest.o_que_quer,
      },
    })
  }),

  compile('POST', '/members/:discordId/resume', true, async (_req, res, { client, params }) => {
    const row = await getOnboardingRecord(params.discordId)
    if (!row) return json(res, 404, { error: 'not_found' })
    if (row.status === 'completed') return json(res, 409, { error: 'already_completed' })

    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) return json(res, 500, { error: 'guild_unavailable' })
    const member = await guild.members.fetch(params.discordId).catch(() => null)
    if (!member) return json(res, 404, { error: 'member_not_in_guild' })

    startOnboarding(member).catch((err) => console.error('[HTTP] resume err:', err))
    await logActivity('resume_by_jarvis', { discord_id: params.discordId })
    json(res, 200, { resumed: true, step: row.current_step })
  }),

  compile('POST', '/members/:discordId/nudge', true, async (_req, res, { client, params }) => {
    const row = await getOnboardingRecord(params.discordId)
    if (!row) return json(res, 404, { error: 'not_found' })
    if (row.status === 'completed') return json(res, 409, { error: 'already_completed' })

    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) return json(res, 500, { error: 'guild_unavailable' })
    const member = await guild.members.fetch(params.discordId).catch(() => null)
    if (!member) return json(res, 404, { error: 'member_not_in_guild' })

    try {
      await member.send(
        'Ei, ainda ta por ai? 👋 Se quiser continuar o onboarding, e so me responder por aqui que eu retomo de onde paramos.'
      )
    } catch (err) {
      console.error('[HTTP] nudge DM err:', err)
      return json(res, 500, { error: 'dm_failed' })
    }
    await logActivity('nudge_by_jarvis', { discord_id: params.discordId })
    json(res, 200, { nudged: true })
  }),

  compile('GET', '/stats', true, async (req, res) => {
    const url = new URL(req.url || '/', 'http://local')
    const period = (url.searchParams.get('period') || 'today').toLowerCase()
    if (!['today', 'week', 'all'].includes(period)) {
      return json(res, 400, { error: 'invalid_period' })
    }

    const today = brtToday()
    let fromISO: string | null = null
    let label = 'total'
    if (period === 'today') {
      fromISO = brtDayStartUTC(today).toISOString()
      label = 'hoje'
    } else if (period === 'week') {
      const start = brtDayStartUTC(today)
      start.setUTCDate(start.getUTCDate() - 6)
      fromISO = start.toISOString()
      label = 'ultimos 7 dias'
    }

    const periodFilter = fromISO
      ? `created_at=gte.${encodeURIComponent(fromISO)}&`
      : ''
    const gateFilter = fromISO
      ? `gate_completed_at=gte.${encodeURIComponent(fromISO)}&`
      : 'gate_completed_at=not.is.null&'

    const [periodRows, completedRows, allRows] = await Promise.all([
      fetchOnboardingRows(`${periodFilter}select=status,created_at,gate_completed_at`),
      fetchOnboardingRows(`${gateFilter}select=gate_completed_at`),
      fetchOnboardingRows(`select=status,gate_completed_at`),
    ])

    const abandonedStatuses = new Set(['abandoned', 'timeout'])
    const entered = periodRows.length
    const completed = completedRows.length
    const abandoned = periodRows.filter((r) => abandonedStatuses.has(r.status)).length
    const inProgress = periodRows.filter(
      (r) => r.status !== 'completed' && !abandonedStatuses.has(r.status)
    ).length

    const total = allRows.length
    const approved = allRows.filter((r) => !!r.gate_completed_at).length

    json(res, 200, {
      period,
      period_label: label,
      entered,
      completed,
      in_progress: inProgress,
      abandoned,
      all_time: {
        total,
        approved,
        pending: total - approved,
      },
    })
  }),

  compile('GET', '/cohort', true, async (req, res) => {
    const url = new URL(req.url || '/', 'http://local')
    const date = url.searchParams.get('date') || brtToday()
    if (!isValidDate(date)) return json(res, 400, { error: 'invalid_date' })

    const start = brtDayStartUTC(date)
    const end = new Date(start.getTime() + 86400000)
    const rows = await fetchOnboardingRows(
      `created_at=gte.${encodeURIComponent(start.toISOString())}&` +
        `created_at=lt.${encodeURIComponent(end.toISOString())}&` +
        `select=*&order=created_at.desc`
    )

    const withProfile = rows.filter((r) => !!r.gate_completed_at)
    const withoutProfile = rows.filter((r) => !r.gate_completed_at)
    const ranked = [...withProfile, ...withoutProfile].slice(0, 20)

    json(res, 200, {
      date,
      total: rows.length,
      with_profile: withProfile.length,
      without_profile_count: withoutProfile.length,
      profiles: ranked.map((r) => ({
        discord_id: r.discord_id,
        username: r.discord_username,
        name: r.name,
        nivel_tecnico: r.nivel_tecnico,
        objetivo: r.objetivo,
        faixa_renda: r.faixa_renda,
        ferramentas: r.ferramentas,
        maior_dificuldade: r.maior_dificuldade,
        como_conheceu: r.como_conheceu,
        o_que_quer: r.o_que_quer,
        current_step: r.current_step,
        created_at: r.created_at ?? null,
        gate_completed_at: r.gate_completed_at ?? null,
      })),
    })
  }),
]

function authOk(req: IncomingMessage): boolean {
  if (!config.httpToken) return false
  const header = req.headers['authorization']
  if (!header || Array.isArray(header)) return false
  const [scheme, token] = header.split(' ')
  return scheme === 'Bearer' && token === config.httpToken
}

export function startHttpServer(client: Client): void {
  if (!config.httpPort) {
    console.log('[HTTP] HTTP_PORT nao setado — servidor desligado')
    return
  }
  if (!config.httpToken) {
    console.error('[HTTP] BOT_HTTP_TOKEN ausente — servidor nao subira')
    return
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://local')
      const route = routes.find(
        (r) => r.method === req.method && r.pattern.test(url.pathname)
      )
      if (!route) return json(res, 404, { error: 'not_found' })

      if (route.auth && !authOk(req)) return json(res, 401, { error: 'unauthorized' })

      const match = url.pathname.match(route.pattern)!
      const params: Record<string, string> = {}
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(match[i + 1])))

      await route.handler(req, res, { client, params })
    } catch (err) {
      console.error('[HTTP] erro interno:', err)
      if (!res.headersSent) json(res, 500, { error: 'internal_error' })
    }
  })

  try {
    server.listen(config.httpPort, () => {
      console.log(`[HTTP] Servidor ouvindo na porta ${config.httpPort}`)
    })
    server.on('error', (err) => {
      console.error('[HTTP] server error:', err)
    })
  } catch (err) {
    console.error('[HTTP] falha ao iniciar server (bot segue):', err)
  }
}
