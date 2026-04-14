import { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } from 'discord.js'
import { config } from './config'

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
})

client.once('ready', async (c) => {
  const guild = c.guilds.cache.get(config.guildId)
  if (!guild) { process.exit(1) }

  console.log('=== Escondendo categorias e canais de @everyone (exceto #gatekeeper) ===\n')

  for (const [, channel] of guild.channels.cache) {
    // Pula o gatekeeper
    if (channel.id === config.channelGatekeeper) continue

    if (!('permissionOverwrites' in channel)) continue

    // Esconde pra @everyone (nao so pra newcomer)
    // Quem tem role @membro vai ver pq @membro tem allow explicito
    try {
      // Primeiro: garante que @membro pode ver
      await (channel as any).permissionOverwrites.edit(config.roleMember, {
        ViewChannel: true,
      })

      // Depois: esconde pra @everyone
      await (channel as any).permissionOverwrites.edit(guild.id, {
        ViewChannel: false,
      })

      const tipo = channel.type === ChannelType.GuildCategory ? 'CATEGORIA' : `#${channel.name}`
      console.log(`  🔒 ${tipo} (${channel.id}) — @everyone: hidden, @membro: visible`)
    } catch {
      console.log(`  ⚠️ ${channel.name} — sem permissao`)
    }
  }

  // Confirma que #gatekeeper ta visivel pra @everyone
  const gk = guild.channels.cache.get(config.channelGatekeeper)
  if (gk && 'permissionOverwrites' in gk) {
    await (gk as any).permissionOverwrites.edit(guild.id, {
      ViewChannel: true,
      ReadMessageHistory: true,
    })
    console.log(`\n  ✅ #gatekeeper — @everyone: visible`)
  }

  console.log('\nDone!')
  process.exit(0)
})

client.login(config.botToken)
