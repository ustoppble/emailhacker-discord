import { Client, GatewayIntentBits } from 'discord.js'
import { config } from './config'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

client.once('ready', async (c) => {
  const guild = c.guilds.cache.get(config.guildId)
  if (!guild) { process.exit(1) }

  const members = await guild.members.fetch()
  let humans = 0
  let bots = 0

  for (const [, m] of members) {
    if (m.user.bot) { bots++; continue }
    humans++
  }

  console.log(`Servidor: ${guild.name}`)
  console.log(`  Total membros: ${guild.memberCount}`)
  console.log(`  Humanos: ${humans}`)
  console.log(`  Bots: ${bots}`)
  console.log(`  Fetch retornou: ${members.size}`)
  process.exit(0)
})

client.login(config.botToken)
