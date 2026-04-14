import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  TextChannel,
  ComponentType,
} from 'discord.js'
import { config } from '../config'
import { startOnboarding } from './onboarding'

export async function sendOGInvite(client: Client): Promise<void> {
  if (!config.channelGeneral) {
    console.log('[ZERO] Canal geral nao configurado — OG invite nao enviado')
    return
  }

  const guild = client.guilds.cache.get(config.guildId)
  if (!guild) return

  const channel = guild.channels.cache.get(config.channelGeneral)
  if (!channel?.isTextBased()) return

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('og_start_onboarding')
      .setLabel('🔓 Responder e ganhar cargo OG')
      .setStyle(ButtonStyle.Success)
  )

  const msg = await (channel as TextChannel).send({
    content:
      '🏆 **Atencao, membros originais!**\n\n' +
      'Montei um questionario rapido pra te conhecer melhor.\n' +
      'Sao 9 perguntas e leva menos de 2 min.\n\n' +
      'Quem responder ganha o cargo **OG** (Original Gangster) — ' +
      'voce entrou antes do gatekeeper existir. Respeito. 🫡\n\n' +
      'Clica no botao abaixo pra comecar 👇',
    components: [row],
  })

  // Listener pro botao (persiste enquanto o bot estiver rodando)
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === 'og_start_onboarding',
  })

  collector.on('collect', async (interaction) => {
    await interaction.reply({
      content: '📨 Te mandei uma DM! Responde la pra desbloquear o cargo OG.',
      ephemeral: true,
    })

    const member = interaction.member
    if (member && 'roles' in member) {
      await startOnboarding(member as any, true)
    }
  })
}
