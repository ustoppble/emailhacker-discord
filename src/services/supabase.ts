import { config } from '../config'

export interface OnboardingRecord {
  discord_id: string
  discord_username: string
  name: string | null
  email: string | null
  whatsapp: string | null
  nivel_tecnico: string | null
  ferramentas: string[] | null
  objetivo: string | null
  faixa_renda: string | null
  maior_dificuldade: string | null
  como_conheceu: string | null
  o_que_quer: string | null
  status: string
  current_step: number
}

async function supabaseRequest(
  endpoint: string,
  method: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  return fetch(`${config.supabaseUrl}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey': config.supabaseServiceKey,
      'Authorization': `Bearer ${config.supabaseServiceKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function getOnboardingRecord(discordId: string): Promise<OnboardingRecord | null> {
  if (!config.supabaseUrl) return null

  try {
    const res = await supabaseRequest(
      `discord_onboarding?discord_id=eq.${discordId}&select=*`,
      'GET'
    )
    const rows = await res.json() as OnboardingRecord[]
    return rows[0] || null
  } catch (err) {
    console.error('[SUPA] Erro ao buscar onboarding:', err)
    return null
  }
}

export async function createOnboardingRecord(discordId: string, discordUsername: string): Promise<void> {
  if (!config.supabaseUrl) return

  try {
    const res = await supabaseRequest(
      'discord_onboarding?on_conflict=discord_id',
      'POST',
      {
        discord_id: discordId,
        discord_username: discordUsername,
        status: 'started',
        current_step: 0,
        name: null,
        email: null,
        whatsapp: null,
        nivel_tecnico: null,
        ferramentas: null,
        objetivo: null,
        faixa_renda: null,
        maior_dificuldade: null,
        como_conheceu: null,
        o_que_quer: null,
      },
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' }
    )
    if (!res.ok) {
      const text = await res.text()
      console.error(`[SUPA] Erro ao criar record: ${res.status} — ${text}`)
    } else {
      console.log(`[SUPA] Record criado/resetado: ${discordUsername}`)
    }
  } catch (err) {
    console.error('[SUPA] Erro ao criar record:', err)
  }
}

export async function saveOnboardingAnswer(
  discordId: string,
  fieldName: string,
  value: string | string[],
  nextStep: number
): Promise<void> {
  if (!config.supabaseUrl) return

  try {
    const res = await supabaseRequest(
      `discord_onboarding?discord_id=eq.${discordId}`,
      'PATCH',
      { [fieldName]: value, current_step: nextStep, status: 'in_progress' },
      { 'Prefer': 'return=minimal' }
    )
    if (!res.ok) {
      const text = await res.text()
      console.error(`[SUPA] Erro ao salvar ${fieldName}: ${res.status} — ${text}`)
    }
  } catch (err) {
    console.error(`[SUPA] Erro ao salvar ${fieldName}:`, err)
  }
}

export async function markGateComplete(discordId: string): Promise<void> {
  if (!config.supabaseUrl) return

  try {
    await supabaseRequest(
      `discord_onboarding?discord_id=eq.${discordId}`,
      'PATCH',
      { status: 'gate_complete', gate_completed_at: new Date().toISOString() },
      { 'Prefer': 'return=minimal' }
    )
    console.log(`[SUPA] 🔓 Gate completo: ${discordId}`)
  } catch (err) {
    console.error('[SUPA] Erro ao marcar gate completo:', err)
  }
}

export async function markOnboardingCompleted(discordId: string): Promise<void> {
  if (!config.supabaseUrl) return

  try {
    await supabaseRequest(
      `discord_onboarding?discord_id=eq.${discordId}`,
      'PATCH',
      { status: 'completed', current_step: 10 },
      { 'Prefer': 'return=minimal' }
    )
    console.log(`[SUPA] ✅ Onboarding completo: ${discordId}`)
  } catch (err) {
    console.error('[SUPA] Erro ao marcar completo:', err)
  }
}

export async function listPendingOnboardings(): Promise<OnboardingRecord[]> {
  if (!config.supabaseUrl) return []

  try {
    const res = await supabaseRequest(
      `discord_onboarding?status=neq.completed&select=*&order=created_at.desc`,
      'GET'
    )
    if (!res.ok) return []
    return (await res.json()) as OnboardingRecord[]
  } catch (err) {
    console.error('[SUPA] Erro ao listar pendentes:', err)
    return []
  }
}

export async function markOnboardingTimeout(discordId: string): Promise<void> {
  if (!config.supabaseUrl) return

  try {
    await supabaseRequest(
      `discord_onboarding?discord_id=eq.${discordId}`,
      'PATCH',
      { status: 'timeout' },
      { 'Prefer': 'return=minimal' }
    )
    console.log(`[SUPA] ⏰ Onboarding timeout: ${discordId}`)
  } catch (err) {
    console.error('[SUPA] Erro ao marcar timeout:', err)
  }
}
