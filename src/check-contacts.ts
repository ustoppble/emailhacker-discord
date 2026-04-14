import { config } from './config'

async function check() {
  // Busca contatos com tag discord-member
  const url = `https://${config.acAccount}.api-us1.com/api/3/contacts?tagid=&listid=127&limit=10`
  const res = await fetch(url, {
    headers: { 'Api-Token': config.acApiKey },
  })
  const data = await res.json()

  if (!data.contacts?.length) {
    // Tenta pela tag
    const tagRes = await fetch(
      `https://${config.acAccount}.api-us1.com/api/3/tags?search=discord-member`,
      { headers: { 'Api-Token': config.acApiKey } }
    )
    const tagData = await tagRes.json()
    const tagId = tagData.tags?.[0]?.id

    if (tagId) {
      const contactsRes = await fetch(
        `https://${config.acAccount}.api-us1.com/api/3/contacts?tagid=${tagId}&limit=10`,
        { headers: { 'Api-Token': config.acApiKey } }
      )
      const contactsData = await contactsRes.json()
      console.log(`Contatos com tag discord-member (tag ${tagId}):`, contactsData.contacts?.length || 0)

      for (const c of contactsData.contacts || []) {
        console.log(`\n--- ${c.firstName} (${c.email}) ID:${c.id} ---`)

        const fvRes = await fetch(
          `https://${config.acAccount}.api-us1.com/api/3/contacts/${c.id}/fieldValues`,
          { headers: { 'Api-Token': config.acApiKey } }
        )
        const fvData = await fvRes.json()

        const ourFields = ['1098','1099','1100','1101','1102','1103','1104','1105','1106','1107']
        for (const fv of fvData.fieldValues || []) {
          if (ourFields.includes(fv.field) && fv.value) {
            console.log(`  field_${fv.field}: ${fv.value}`)
          }
        }
      }
    } else {
      console.log('Nenhum contato com tag discord-member encontrado')
    }
  } else {
    console.log(`Contatos na lista Discord Vibe Coders: ${data.contacts.length}`)
    for (const c of data.contacts) {
      console.log(`  ${c.firstName} — ${c.email}`)
    }
  }
}

check().catch(console.error)
