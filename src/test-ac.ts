import { config } from './config'

async function testAC() {
  console.log('[TEST] Testando conexao com ActiveCampaign...')
  console.log(`[TEST] Conta: ${config.acAccount}`)

  const url = `https://${config.acAccount}.api-us1.com/api/3/fields?limit=5`
  const res = await fetch(url, {
    headers: { 'Api-Token': config.acApiKey },
  })

  if (!res.ok) {
    console.error(`[TEST] FALHOU: ${res.status} ${res.statusText}`)
    process.exit(1)
  }

  const data = await res.json()
  console.log(`[TEST] ✅ Conexao OK! ${data.fields?.length || 0} campos encontrados`)

  // Teste de criacao de contato fake (nao salva — so valida o endpoint)
  const syncUrl = `https://${config.acAccount}.api-us1.com/api/3/contact/sync`
  const syncRes = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      'Api-Token': config.acApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contact: {
        email: 'teste-zero-bot@emailhacker.ai',
        firstName: 'Teste ZERO',
        phone: '5511999999999',
      },
    }),
  })

  if (!syncRes.ok) {
    const text = await syncRes.text()
    console.error(`[TEST] Sync FALHOU: ${syncRes.status} — ${text}`)
    process.exit(1)
  }

  const syncData = await syncRes.json()
  const contactId = syncData.contact?.id
  console.log(`[TEST] ✅ Contato criado/atualizado! ID: ${contactId}`)

  // Deleta o contato de teste
  if (contactId) {
    await fetch(`https://${config.acAccount}.api-us1.com/api/3/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 'Api-Token': config.acApiKey },
    })
    console.log(`[TEST] 🗑️  Contato de teste removido`)
  }

  console.log('\n[TEST] Tudo funcionando! O bot vai sincronizar pro AC sem problemas.')
}

testAC().catch(console.error)
