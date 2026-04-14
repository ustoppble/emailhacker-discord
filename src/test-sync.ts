import { syncToAC } from './services/ac-sync'
import { config } from './config'

async function test() {
  console.log('[TEST] Enviando lead completo pro AC...\n')

  await syncToAC({
    discord_id: '999999999',
    discord_username: 'teste_zero_v2',
    name: 'Teste ZERO v2',
    email: 'teste-zero-v2@emailhacker.ai',
    whatsapp: '5551999887766',
    nivel_tecnico: 'avancado',
    ferramentas: ['claude-code', 'cursor', 'lovable'],
    objetivo: 'saas',
    faixa_renda: '5k-10k',
    maior_dificuldade: 'vender',
    como_conheceu: 'youtube',
    o_que_quer: 'Quero um curso completo de como monetizar apps feitos com IA',
  })

  console.log('\n[TEST] Verificando se o contato existe no AC...')

  const url = `https://${config.acAccount}.api-us1.com/api/3/contacts?email=teste-zero-v2@emailhacker.ai`
  const res = await fetch(url, {
    headers: { 'Api-Token': config.acApiKey },
  })
  const data = await res.json()
  const contact = data.contacts?.[0]

  if (!contact) {
    console.error('[TEST] ❌ Contato NAO encontrado no AC!')
    process.exit(1)
  }

  console.log(`[TEST] ✅ Contato encontrado! ID: ${contact.id}`)
  console.log(`  Nome: ${contact.firstName}`)
  console.log(`  Email: ${contact.email}`)
  console.log(`  Telefone: ${contact.phone}`)

  // Busca campos customizados
  const fieldsRes = await fetch(
    `https://${config.acAccount}.api-us1.com/api/3/contacts/${contact.id}/fieldValues`,
    { headers: { 'Api-Token': config.acApiKey } }
  )
  const fieldsData = await fieldsRes.json()

  // Busca nomes dos campos
  const allFieldsRes = await fetch(
    `https://${config.acAccount}.api-us1.com/api/3/fields?limit=100&offset=0`,
    { headers: { 'Api-Token': config.acApiKey } }
  )
  const allFieldsData = await allFieldsRes.json()
  const fieldMap = new Map<string, string>()
  for (const f of allFieldsData.fields || []) {
    fieldMap.set(f.id, f.title)
  }

  console.log('\n  Campos customizados:')
  for (const fv of fieldsData.fieldValues || []) {
    const name = fieldMap.get(fv.field) || `field_${fv.field}`
    if (fv.value) {
      console.log(`    ${name}: ${fv.value}`)
    }
  }

  // Busca tags
  const tagsRes = await fetch(
    `https://${config.acAccount}.api-us1.com/api/3/contacts/${contact.id}/contactTags`,
    { headers: { 'Api-Token': config.acApiKey } }
  )
  const tagsData = await tagsRes.json()

  const tagIds = (tagsData.contactTags || []).map((ct: any) => ct.tag)
  const tagNames: string[] = []
  for (const tagId of tagIds) {
    const tagRes = await fetch(
      `https://${config.acAccount}.api-us1.com/api/3/tags/${tagId}`,
      { headers: { 'Api-Token': config.acApiKey } }
    )
    const tagData = await tagRes.json()
    tagNames.push(tagData.tag?.tag || tagId)
  }

  console.log(`\n  Tags: ${tagNames.join(', ')}`)

  // Limpa contato de teste
  await fetch(
    `https://${config.acAccount}.api-us1.com/api/3/contacts/${contact.id}`,
    { method: 'DELETE', headers: { 'Api-Token': config.acApiKey } }
  )
  console.log('\n[TEST] 🗑️ Contato de teste removido')
  console.log('[TEST] ✅ TUDO OK!')
}

test().catch(console.error)
