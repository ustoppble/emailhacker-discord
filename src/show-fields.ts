import { config } from './config'

const FIELD_IDS = ['1098','1099','1100','1101','1102','1103','1104','1105','1106','1107']

async function showFields() {
  for (const id of FIELD_IDS) {
    const url = `https://${config.acAccount}.api-us1.com/api/3/fields/${id}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Api-Token': config.acApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        field: { visible: 1, isrequired: 0 },
      }),
    })

    if (res.ok) {
      const data = await res.json()
      console.log(`✅ ${data.field.title} — visible: ${data.field.visible}`)
    } else {
      console.error(`❌ field ${id}: ${res.status}`)
    }
  }
}

showFields().catch(console.error)
