import { config } from '../config'

// Mapping: campo do onboarding → campo customizado no AC
const AC_FIELDS: Record<string, { title: string; type: string }> = {
  discord_username: { title: '[DISC] Username', type: 'text' },
  discord_id: { title: '[DISC] ID', type: 'text' },
  nivel_tecnico: { title: '[DISC] Nivel Tecnico', type: 'text' },
  ferramentas: { title: '[DISC] Ferramentas', type: 'text' },
  objetivo: { title: '[DISC] Objetivo', type: 'text' },
  faixa_renda: { title: '[DISC] Faixa Renda', type: 'text' },
  maior_dificuldade: { title: '[DISC] Maior Dificuldade', type: 'text' },
  como_conheceu: { title: '[DISC] Como Conheceu', type: 'text' },
  o_que_quer: { title: '[DISC] O Que Quer De Mim', type: 'textarea' },
}

async function acRequest(endpoint: string, method: string, body?: unknown) {
  const url = `https://${config.acAccount}.api-us1.com/api/3/${endpoint}`
  const res = await fetch(url, {
    method,
    headers: {
      'Api-Token': config.acApiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AC API ${method} ${endpoint}: ${res.status} — ${text}`)
  }
  return res.json() as Promise<any>
}

// Cache de field IDs
const fieldCache = new Map<string, string>()

async function getOrCreateField(title: string, type: string): Promise<string> {
  if (fieldCache.has(title)) return fieldCache.get(title)!

  let offset = 0
  while (true) {
    const { fields } = await acRequest(`fields?limit=100&offset=${offset}`, 'GET')
    if (!fields || fields.length === 0) break
    const existing = fields.find((f: any) => f.title === title)
    if (existing) {
      fieldCache.set(title, existing.id)
      return existing.id
    }
    offset += 100
    if (fields.length < 100) break
  }

  try {
    const { field } = await acRequest('fields', 'POST', {
      field: { title, type, visible: 1 },
    })
    fieldCache.set(title, field.id)
    return field.id
  } catch (err) {
    if (String(err).includes('field_already_exists')) {
      let off = 0
      while (true) {
        const { fields } = await acRequest(`fields?limit=100&offset=${off}`, 'GET')
        if (!fields || fields.length === 0) break
        const found = fields.find((f: any) => f.title.toLowerCase() === title.toLowerCase())
        if (found) {
          fieldCache.set(title, found.id)
          return found.id
        }
        off += 100
        if (fields.length < 100) break
      }
    }
    throw err
  }
}

async function addTag(contactId: string, tagName: string): Promise<void> {
  const { tags: existing } = await acRequest(`tags?search=${encodeURIComponent(tagName)}`, 'GET')
  let tagId = existing?.[0]?.id
  if (!tagId) {
    const { tag } = await acRequest('tags', 'POST', { tag: { tag: tagName, tagType: 'contact' } })
    tagId = tag.id
  }
  await acRequest('contactTags', 'POST', {
    contactTag: { contact: contactId, tag: tagId },
  }).catch(() => {})
}

// Pre-resolve todos os field IDs (aquece cache pra updates incrementais)
async function resolveAllFieldIds(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  for (const [key, { title, type }] of Object.entries(AC_FIELDS)) {
    ids[key] = await getOrCreateField(title, type)
  }
  console.log('[AC] Campos resolvidos:', Object.entries(ids).map(([k, v]) => `${k}=${v}`).join(', '))
  return ids
}

/**
 * Sync inicial após gate (Q1-3).
 * Cria contato no AC com dados básicos + tags + listas.
 * Aquece cache de field IDs pra updates incrementais.
 */
export async function syncGateToAC(data: {
  email: string
  name: string
  whatsapp: string
  discord_id: string
  discord_username: string
}): Promise<void> {
  try {
    console.log(`[AC] Gate sync: ${data.email}...`)

    const fieldIds = await resolveAllFieldIds()

    const { contact } = await acRequest('contact/sync', 'POST', {
      contact: {
        email: data.email,
        firstName: data.name,
        phone: data.whatsapp,
        fieldValues: [
          { field: fieldIds.discord_username, value: data.discord_username },
          { field: fieldIds.discord_id, value: data.discord_id },
        ],
      },
    })

    console.log(`[AC] Contato criado/atualizado: ${data.email} (ID: ${contact.id})`)

    // Lista All
    await acRequest('contactLists', 'POST', {
      contactList: { list: '83', contact: contact.id, status: 1 },
    }).catch(() => {})

    // Tag
    await addTag(contact.id, 'discord-member')

    console.log(`[AC] ✅ Gate sync completo: ${data.email}`)
  } catch (err) {
    console.error('[AC] ❌ Erro no gate sync:', err)
  }
}

/**
 * Atualiza um campo no AC após cada resposta bonus (Q4-10).
 * Usa contact/sync (upsert por email) com apenas o campo alterado.
 */
export async function updateACField(email: string, fieldKey: string, value: string): Promise<void> {
  try {
    const field = AC_FIELDS[fieldKey]
    if (!field) return
    const fieldId = await getOrCreateField(field.title, field.type)

    await acRequest('contact/sync', 'POST', {
      contact: {
        email,
        fieldValues: [{ field: fieldId, value }],
      },
    })
    console.log(`[AC] Atualizado: ${fieldKey}`)
  } catch (err) {
    console.error(`[AC] Erro ao atualizar ${fieldKey}:`, err)
  }
}

/**
 * Marca onboarding completo no AC: adiciona tags de conclusão e segmentação.
 */
export async function markACOnboardingComplete(email: string): Promise<void> {
  try {
    const { contacts } = await acRequest(`contacts?email=${encodeURIComponent(email)}`, 'GET')
    const contactId = contacts?.[0]?.id
    if (!contactId) return

    await addTag(contactId, 'discord-onboarding-completo')

    console.log(`[AC] ✅ Onboarding completo: ${email}`)
  } catch (err) {
    console.error('[AC] Erro ao marcar completo:', err)
  }
}
