import { Client, GatewayIntentBits, Events } from 'discord.js'
import { config } from './config'
import { startOnboarding } from './handlers/onboarding'
import { sendOGInvite } from './handlers/og-invite'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
})

client.once(Events.ClientReady, (c) => {
  console.log(`[ZERO] Online como ${c.user.tag}`)
  console.log(`[ZERO] Servidor: ${config.guildId}`)
  console.log(`[ZERO] Roles — newcomer: ${config.roleNewcomer || 'NAO CONFIGURADO'}`)
  console.log(`[ZERO] Roles — membro: ${config.roleMember || 'NAO CONFIGURADO'}`)

  // Descobre IDs de roles e canais automaticamente
  const guild = c.guilds.cache.get(config.guildId)
  if (guild) {
    console.log('\n[ZERO] === Roles no servidor ===')
    guild.roles.cache.forEach((role) => {
      if (role.name !== '@everyone') {
        console.log(`  ${role.name}: ${role.id}`)
      }
    })
    console.log('\n[ZERO] === Canais no servidor ===')
    guild.channels.cache.forEach((ch) => {
      console.log(`  #${ch.name}: ${ch.id}`)
    })
    console.log('')
  }
})

// Novo membro entra no servidor
client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`[ZERO] Novo membro: ${member.user.tag}`)

  // Atribui role newcomer (se configurado)
  if (config.roleNewcomer) {
    await member.roles.add(config.roleNewcomer).catch((err) =>
      console.error(`[ZERO] Erro ao atribuir role newcomer:`, err.message)
    )
  }

  // Inicia onboarding via DM
  await startOnboarding(member)
})

// DM recebida (para re-iniciar onboarding apos timeout)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return
  if (!message.guild) {
    // DM recebida — verifica se o usuario precisa fazer onboarding
    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) return

    const member = await guild.members.fetch(message.author.id).catch(() => null)
    if (!member) return

    // Se tem role newcomer ou nao tem role membro, reinicia onboarding
    const hasNewcomer = config.roleNewcomer && member.roles.cache.has(config.roleNewcomer)
    const hasMember = config.roleMember && member.roles.cache.has(config.roleMember)

    if (hasNewcomer || !hasMember) {
      await message.reply('Bora la! Vou continuar o questionario. 🔥')
      await startOnboarding(member)
    }
  }
})

// Login
client.login(config.botToken).catch((err) => {
  console.error('[ZERO] Falha no login:', err.message)
  process.exit(1)
})
