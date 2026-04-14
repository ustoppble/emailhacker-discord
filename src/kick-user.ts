import { Client, GatewayIntentBits } from 'discord.js'
import { config } from './config'

const TARGET_ID = '1487282968404951225' // cwbhooha

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

client.once('ready', async (c) => {
  const guild = c.guilds.cache.get(config.guildId)
  if (!guild) { process.exit(1) }

  const member = await guild.members.fetch(TARGET_ID)
  await member.kick('Re-entry para teste de onboarding')
  console.log(`✅ ${member.user.tag} kickado`)
  process.exit(0)
})

client.login(config.botToken)
