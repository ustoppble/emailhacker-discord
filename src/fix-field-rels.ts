import { config } from './config'

const FIELD_IDS = ['1117','1118','1119','1120','1121','1122','1123','1124','1125','1126']

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
  // 1. Busca todas as listas
  const { data: listsData } = await acRequest('lists?limit=100', 'GET')
  const lists = listsData?.lists || []
  console.log(`${lists.length} listas encontradas\n`)

  // 2. Pra cada campo, verifica rels existentes e cria as que faltam
  for (const fieldId of FIELD_IDS) {
    // Busca campo pra saber o nome
    const { data: fieldData } = await acRequest(`fields/${fieldId}`, 'GET')
    const fieldName = fieldData?.field?.title || fieldId

    // Busca rels existentes
    const { data: relsData } = await acRequest(`fields/${fieldId}/rels`, 'GET')
    const existingRels = (relsData?.fieldRels || []).map((r: any) => r.relid)

    console.log(`${fieldName} — ${existingRels.length} rels existentes`)

    // Cria rel pra cada lista que ainda nao tem
    for (const list of lists) {
      if (existingRels.includes(String(list.id))) continue

      const { ok, data } = await acRequest('fieldRels', 'POST', {
        fieldRel: {
          field: fieldId,
          relid: list.id,
        },
      })

      if (ok) {
        console.log(`  ✅ → lista ${list.id} (${list.name})`)
      } else {
        console.log(`  ⚠️ → lista ${list.id}: ${JSON.stringify(data?.errors?.[0]?.title || data)}`)
      }
    }

    // Tambem associa a relid=0 (todas as listas / global)
    const { ok } = await acRequest('fieldRels', 'POST', {
      fieldRel: { field: fieldId, relid: 0 },
    })
    console.log(`  ${ok ? '✅' : '⚠️'} → global (relid=0)`)

    console.log('')
  }

  console.log('Done!')
}

run().catch(console.error)
