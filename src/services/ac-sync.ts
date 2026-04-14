import { config } from '../config'

interface OnboardingData {
  discord_id: string
  discord_username: string
  name: string
  email: string
  whatsapp: string
  nivel_tecnico: string
  ferramentas: string[]
  objetivo: string
  faixa_renda: string
  maior_dificuldade: string
  como_conheceu: string
  o_que_quer: string
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

// Cache de field IDs pra nao ficar buscando toda vez
const fieldCache = new Map<string, string>()

async function getOrCreateField(title: string, type: string): Promise<string> {
  if (fieldCache.has(title)) return fieldCache.get(title)!

  // Busca com paginacao (AC pode ter muitos campos)
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

  // Nao encontrou — cria
  try {
    const { field } = await acRequest('fields', 'POST', {
      field: { title, type, visible: 1 },
    })
    fieldCache.set(title, field.id)
    return field.id
  } catch (err) {
    // Se ja existe (race condition ou case sensitivity), busca de novo
    if (String(err).includes('field_already_exists')) {
      // Busca todos paginando
      let off = 0
      while (true) {
        const { fields } = await acRequest(`fields?limit=100&offset=${off}`, 'GET')
        if (!fields || fields.length === 0) break
        const found = fields.find((f: any) =>
          f.title.toLowerCase() === title.toLowerCase()
        )
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

export async function syncToAC(data: OnboardingData): Promise<void> {
  try {
    console.log(`[AC] Iniciando sync para ${data.email}...`)

    // Garante que os campos customizados existem
    const fieldIds = {
      discord_username: await getOrCreateField('[DISC] Username', 'text'),
      discord_id: await getOrCreateField('[DISC] ID', 'text'),
      whatsapp: await getOrCreateField('[DISC] WhatsApp', 'text'),
      nivel_tecnico: await getOrCreateField('[DISC] Nivel Tecnico', 'text'),
      ferramentas_vibe: await getOrCreateField('[DISC] Ferramentas', 'text'),
      objetivo_principal: await getOrCreateField('[DISC] Objetivo', 'text'),
      faixa_renda_software: await getOrCreateField('[DISC] Faixa Renda', 'text'),
      maior_dificuldade: await getOrCreateField('[DISC] Maior Dificuldade', 'text'),
      como_conheceu: await getOrCreateField('[DISC] Como Conheceu', 'text'),
      o_que_quer_de_mim: await getOrCreateField('[DISC] O Que Quer De Mim', 'textarea'),
    }

    console.log(`[AC] Campos resolvidos:`, Object.entries(fieldIds).map(([k,v]) => `${k}=${v}`).join(', '))

    // Sync contato
    const { contact } = await acRequest('contact/sync', 'POST', {
      contact: {
        email: data.email,
        firstName: data.name,
        phone: data.whatsapp,
        fieldValues: [
          { field: fieldIds.discord_username, value: data.discord_username },
          { field: fieldIds.discord_id, value: data.discord_id },
          { field: fieldIds.whatsapp, value: data.whatsapp },
          { field: fieldIds.nivel_tecnico, value: data.nivel_tecnico },
          { field: fieldIds.ferramentas_vibe, value: data.ferramentas.join(', ') },
          { field: fieldIds.objetivo_principal, value: data.objetivo },
          { field: fieldIds.faixa_renda_software, value: data.faixa_renda },
          { field: fieldIds.maior_dificuldade, value: data.maior_dificuldade },
          { field: fieldIds.como_conheceu, value: data.como_conheceu },
          { field: fieldIds.o_que_quer_de_mim, value: data.o_que_quer },
        ],
      },
    })

    const contactId = contact.id
    console.log(`[AC] Contato criado/atualizado: ${data.email} (ID: ${contactId})`)

    // Adiciona a lista All (ID 83) + Discord Vibe Coders (ID 127)
    for (const listId of ['83', '127']) {
      await acRequest('contactLists', 'POST', {
        contactList: { list: listId, contact: contactId, status: 1 },
      }).catch(() => {})
    }
    console.log(`[AC] Adicionado as listas All + Discord Vibe Coders`)

    // Adiciona tags
    const tags = [
      'discord-member',
      'fonte:discord',
      'audiencia:vibe-coder',
      `nivel:${data.nivel_tecnico}`,
      `objetivo:${data.objetivo}`,
    ]

    for (const tagName of tags) {
      const { tags: existingTags } = await acRequest(
        `tags?search=${encodeURIComponent(tagName)}`,
        'GET'
      )
      let tagId = existingTags?.[0]?.id

      if (!tagId) {
        const { tag } = await acRequest('tags', 'POST', {
          tag: { tag: tagName, tagType: 'contact' },
        })
        tagId = tag.id
      }

      await acRequest('contactTags', 'POST', {
        contactTag: { contact: contactId, tag: tagId },
      }).catch(() => {
        // Tag ja vinculada — ignora
      })

      console.log(`[AC] Tag "${tagName}" vinculada`)
    }

    console.log(`[AC] ✅ Sync completo: ${data.email}`)
  } catch (err) {
    console.error('[AC] ❌ Erro ao sincronizar contato:', err)
  }
}
