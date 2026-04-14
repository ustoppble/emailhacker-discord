import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js'
import { config } from './config'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const NEWCOMER_ROLE_ID = '1487280993697271949'
const MEMBER_ROLE_ID = '1487280995240644718'
const OG_ROLE_ID = '1487280996482027550'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

client.once('ready', async (c) => {
  console.log(`[SETUP] Online como ${c.user.tag}`)

  const guild = c.guilds.cache.get(config.guildId)
  if (!guild) {
    console.error('[SETUP] Servidor nao encontrado')
    process.exit(1)
  }

  // 1. Criar canal #gatekeeper
  console.log('\n[SETUP] Criando canal #gatekeeper...')

  const gatekeeperChannel = await guild.channels.create({
    name: 'gatekeeper',
    type: ChannelType.GuildText,
    topic: 'Responda as perguntas do ZERO pra desbloquear o servidor',
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: NEWCOMER_ROLE_ID,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        id: c.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  })
  console.log(`  ✅ #gatekeeper: ${gatekeeperChannel.id}`)

  // 2. Bloquear canais existentes para @newcomer
  console.log('\n[SETUP] Bloqueando canais existentes para @newcomer...')

  for (const [, channel] of guild.channels.cache) {
    if (channel.id === gatekeeperChannel.id) continue
    if (!('permissionOverwrites' in channel)) continue

    try {
      await (channel as any).permissionOverwrites.create(NEWCOMER_ROLE_ID, {
        ViewChannel: false,
      })
      console.log(`  🔒 #${channel.name}`)
    } catch {
      console.log(`  ⚠️  #${channel.name} — sem permissao`)
    }
  }

  // 3. Mensagem de boas-vindas no #gatekeeper
  await gatekeeperChannel.send(
    '🔒 **Bem-vindo ao servidor!**\n\n' +
    'O **ZERO** vai te mandar uma DM com 9 perguntas rapidas.\n' +
    'Responda todas pra desbloquear o acesso completo aos canais.\n\n' +
    '> Se nao recebeu a DM, verifique se suas DMs estao abertas para este servidor.'
  )
  console.log('  ✅ Mensagem enviada no #gatekeeper')

  // 4. Pegar ID do #general
  const generalChannel = guild.channels.cache.find(
    (ch) => ch.name === 'general' && ch.type === ChannelType.GuildText
  )

  // 5. Salvar IDs no .secrets
  console.log('\n[SETUP] Salvando IDs no .secrets...')

  const secretsPath = resolve(__dirname, '../../../.secrets')
  let secrets = readFileSync(secretsPath, 'utf-8')

  const additions = [
    `DISCORD_ROLE_NEWCOMER=${NEWCOMER_ROLE_ID}`,
    `DISCORD_ROLE_MEMBER=${MEMBER_ROLE_ID}`,
    `DISCORD_ROLE_OG=${OG_ROLE_ID}`,
    `DISCORD_CHANNEL_GATEKEEPER=${gatekeeperChannel.id}`,
    `DISCORD_CHANNEL_GENERAL=${generalChannel?.id || ''}`,
  ]

  secrets = secrets.replace(
    'DISCORD_GUILD_ID=' + config.guildId,
    'DISCORD_GUILD_ID=' + config.guildId + '\n' + additions.join('\n')
  )

  writeFileSync(secretsPath, secrets)
  console.log('  ✅ IDs salvos no .secrets')

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('[SETUP] COMPLETO!')
  console.log(`  Role newcomer:  ${NEWCOMER_ROLE_ID}`)
  console.log(`  Role membro:    ${MEMBER_ROLE_ID}`)
  console.log(`  Role OG:        ${OG_ROLE_ID}`)
  console.log(`  #gatekeeper:    ${gatekeeperChannel.id}`)
  console.log(`  #general:       ${generalChannel?.id || 'nao encontrado'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  process.exit(0)
})

client.login(config.botToken)
