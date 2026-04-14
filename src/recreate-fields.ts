import { config } from './config'

const OLD_IDS = ['1098','1099','1100','1101','1102','1103','1104','1105','1106','1107']

const FIELDS = [
  { title: '[DISC] Username', type: 'text' },
  { title: '[DISC] ID', type: 'text' },
  { title: '[DISC] WhatsApp', type: 'text' },
  { title: '[DISC] Nivel Tecnico', type: 'text' },
  { title: '[DISC] Ferramentas', type: 'text' },
  { title: '[DISC] Objetivo', type: 'text' },
  { title: '[DISC] Faixa Renda', type: 'text' },
  { title: '[DISC] Maior Dificuldade', type: 'text' },
  { title: '[DISC] Como Conheceu', type: 'text' },
  { title: '[DISC] O Que Quer De Mim', type: 'textarea' },
]

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
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
}

async function run() {
  // 1. Deleta campos antigos
  console.log('Deletando campos antigos...')
  for (const id of OLD_IDS) {
    const { ok } = await acRequest(`fields/${id}`, 'DELETE')
    console.log(`  ${ok ? '✅' : '⚠️'} field ${id} deletado`)
  }

  // 2. Cria novos campos (visible, na secao de contato)
  console.log('\nCriando campos novos...')
  const newIds: Record<string, string> = {}

  for (const f of FIELDS) {
    const { ok, data } = await acRequest('fields', 'POST', {
      field: {
        title: f.title,
        type: f.type,
        visible: 1,
        ordernum: 1,
        perstag: f.title.replace(/[\[\] ]/g, '_').toLowerCase(),
      },
    })

    if (ok && data?.field) {
      newIds[f.title] = data.field.id
      console.log(`  ✅ ${f.title} → ID ${data.field.id}`)
    } else {
      console.error(`  ❌ ${f.title}: ${JSON.stringify(data?.errors || data)}`)
    }
  }

  // 3. Associa campos a lista All (83) e Discord (127)
  console.log('\nAssociando campos as listas...')
  for (const [title, fieldId] of Object.entries(newIds)) {
    for (const listId of ['83', '127']) {
      const { ok } = await acRequest('fieldRels', 'POST', {
        fieldRel: {
          field: fieldId,
          relid: listId,
          dorder: 0,
        },
      })
      console.log(`  ${ok ? '✅' : '⚠️'} ${title} → lista ${listId}`)
    }
  }

  console.log('\nNovos IDs:', JSON.stringify(newIds, null, 2))
  console.log('\nDone! Atualizar ac-sync.ts com os novos IDs se necessario.')
}

run().catch(console.error)
