import { config } from './config'

const RENAMES: Record<string, string> = {
  '1098': '[DISC] Username',
  '1099': '[DISC] ID',
  '1100': '[DISC] WhatsApp',
  '1101': '[DISC] Nivel Tecnico',
  '1102': '[DISC] Ferramentas',
  '1103': '[DISC] Objetivo',
  '1104': '[DISC] Faixa Renda',
  '1105': '[DISC] Como Conheceu',
  '1106': '[DISC] O Que Quer De Mim',
  '1107': '[DISC] Maior Dificuldade',
}

async function rename() {
  for (const [id, newTitle] of Object.entries(RENAMES)) {
    const url = `https://${config.acAccount}.api-us1.com/api/3/fields/${id}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Api-Token': config.acApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        field: { title: newTitle },
      }),
    })

    if (res.ok) {
      console.log(`✅ field ${id} → ${newTitle}`)
    } else {
      const text = await res.text()
      console.error(`❌ field ${id}: ${res.status} — ${text}`)
    }
  }

  console.log('\nDone!')
}

rename().catch(console.error)
