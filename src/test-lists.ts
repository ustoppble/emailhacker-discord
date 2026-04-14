import { config } from './config'

async function test() {
  const url = `https://${config.acAccount}.api-us1.com/api/3/lists?limit=100`
  const res = await fetch(url, {
    headers: { 'Api-Token': config.acApiKey },
  })
  const data = await res.json()

  console.log('Listas no AC:')
  for (const list of data.lists || []) {
    console.log(`  ID: ${list.id} — ${list.name} (${list.subscriber_count} contatos)`)
  }
}

test().catch(console.error)
