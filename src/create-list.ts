import { config } from './config'

async function createList() {
  const url = `https://${config.acAccount}.api-us1.com/api/3/lists`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Api-Token': config.acApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      list: {
        name: 'Discord — Vibe Coders',
        stringid: 'discord-vibe-coders',
        sender_url: 'https://emailhacker.ai',
        sender_reminder: 'Voce entrou no nosso Discord e fez o onboarding com o ZERO.',
      },
    }),
  })

  const data = await res.json()
  console.log('Lista criada:', data.list?.id, data.list?.name)
}

createList().catch(console.error)
