import { Client, GatewayIntentBits } from 'discord.js'
import { config } from './config'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

client.once('ready', async (c) => {
  const guild = c.guilds.cache.get(config.guildId)
  if (!guild) { process.exit(1) }

  const members = await guild.members.fetch()
  let count = 0

  for (const [, member] of members) {
    if (member.user.bot) continue

    const hasMember = member.roles.cache.has(config.roleMember)
    if (hasMember) continue

    // Adiciona role @membro
    await member.roles.add(config.roleMember).catch(() => {})

    // Remove role @newcomer se tiver
    if (member.roles.cache.has(config.roleNewcomer)) {
      await member.roles.remove(config.roleNewcomer).catch(() => {})
    }

    count++
    console.log(`  ✅ ${member.user.username} → @membro`)
  }

  console.log(`\nDone! ${count} membros atualizados.`)
  process.exit(0)
})

client.login(config.botToken)
