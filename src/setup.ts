import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js'
import { config } from './config'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

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

  // 1. Criar roles
  console.log('\n[SETUP] Criando roles...')

  const newcomerRole = await guild.roles.create({
    name: 'newcomer',
    color: 0x95a5a6, // cinza
    reason: 'ZERO gatekeeper — role temporaria para novos membros',
  })
  console.log(`  ✅ newcomer: ${newcomerRole.id}`)

  const membroRole = await guild.roles.create({
    name: 'membro',
    color: 0x2ecc71, // verde
    reason: 'ZERO gatekeeper — acesso completo ao servidor',
  })
  console.log(`  ✅ membro: ${membroRole.id}`)

  const ogRole = await guild.roles.create({
    name: 'OG',
    color: 0xf1c40f, // dourado
    reason: 'ZERO gatekeeper — Original Gangster (membros pre-gatekeeper)',
  })
  console.log(`  ✅ OG: ${ogRole.id}`)

  // 2. Criar canal #gatekeeper
  console.log('\n[SETUP] Criando canal #gatekeeper...')

  const gatekeeperChannel = await guild.channels.create({
    name: 'gatekeeper',
    type: ChannelType.GuildText,
    topic: '🔒 Responda as perguntas do ZERO pra desbloquear o servidor',
    permissionOverwrites: [
      {
        // @everyone — nao ve o canal
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        // newcomer — ve o canal (read only)
        id: newcomerRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        // bot — pode mandar mensagem
        id: c.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  })
  console.log(`  ✅ #gatekeeper: ${gatekeeperChannel.id}`)

  // 3. Configurar canais existentes — esconder de @newcomer
  console.log('\n[SETUP] Bloqueando canais existentes para @newcomer...')

  for (const [, channel] of guild.channels.cache) {
    if (channel.id === gatekeeperChannel.id) continue
    if (!('permissionOverwrites' in channel)) continue

    try {
      await (channel as any).permissionOverwrites.create(newcomerRole, {
        ViewChannel: false,
      })
      console.log(`  🔒 #${channel.name}`)
    } catch (err) {
      console.log(`  ⚠️ #${channel.name} — nao consegui alterar permissoes`)
    }
  }

  // Pegar ID do #general
  const generalChannel = guild.channels.cache.find(
    (ch) => ch.name === 'general' && ch.type === ChannelType.GuildText
  )

  // 4. Mandar mensagem de boas-vindas no #gatekeeper
  await gatekeeperChannel.send(
    '🔒 **Bem-vindo ao servidor!**\n\n' +
    'O **ZERO** vai te mandar uma DM com 9 perguntas rapidas.\n' +
    'Responda todas pra desbloquear o acesso completo aos canais.\n\n' +
    '> Se nao recebeu a DM, verifique se suas DMs estao abertas para este servidor.'
  )

  // 5. Salvar IDs no .secrets
  console.log('\n[SETUP] Salvando IDs no .secrets...')

  const secretsPath = resolve(__dirname, '../../../.secrets')
  let secrets = readFileSync(secretsPath, 'utf-8')

  const additions = [
    `DISCORD_ROLE_NEWCOMER=${newcomerRole.id}`,
    `DISCORD_ROLE_MEMBER=${membroRole.id}`,
    `DISCORD_ROLE_OG=${ogRole.id}`,
    `DISCORD_CHANNEL_GATEKEEPER=${gatekeeperChannel.id}`,
    `DISCORD_CHANNEL_GENERAL=${generalChannel?.id || ''}`,
  ]

  // Adiciona apos DISCORD_GUILD_ID
  const insertAfter = 'DISCORD_GUILD_ID=' + config.guildId
  secrets = secrets.replace(
    insertAfter,
    insertAfter + '\n' + additions.join('\n')
  )

  writeFileSync(secretsPath, secrets)
  console.log('  ✅ IDs salvos no .secrets')

  // Resumo
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('[SETUP] COMPLETO! Resumo:')
  console.log(`  Role newcomer:  ${newcomerRole.id}`)
  console.log(`  Role membro:    ${membroRole.id}`)
  console.log(`  Role OG:        ${ogRole.id}`)
  console.log(`  #gatekeeper:    ${gatekeeperChannel.id}`)
  console.log(`  #general:       ${generalChannel?.id || 'nao encontrado'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  process.exit(0)
})

client.login(config.botToken)
