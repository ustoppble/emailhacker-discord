import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  GuildMember,
  TextChannel,
  ThreadChannel,
  ChannelType,
  Message,
  ComponentType,
  StringSelectMenuInteraction,
  ButtonInteraction,
} from 'discord.js'
import { config } from '../config'
import { syncToAC } from '../services/ac-sync'
import { isValidEmail, normalizePhone } from '../utils/validators'

interface OnboardingData {
  discord_id: string
  discord_username: string
  name: string
  email: string
  whatsapp: string
  nivel_tecnico: string
  ferramentas: string[]
  objetivo: string
  faixa_renda: string
  maior_dificuldade: string
  como_conheceu: string
  o_que_quer: string
}

// Sessoes ativas
const sessions = new Map<string, boolean>()

const TIMEOUT = 10 * 60 * 1000

async function askText(
  thread: ThreadChannel,
  userId: string,
  question: string,
  validate?: (input: string) => boolean,
  errorMsg?: string
): Promise<string> {
  await thread.send(question)

  const tryCollect = async (): Promise<string> => {
    const collected = await thread.awaitMessages({
      max: 1,
      time: TIMEOUT,
      filter: (m: Message) => m.author.id === userId,
    })

    const answer = collected.first()?.content?.trim()
    if (!answer) throw new Error('timeout')

    if (validate && !validate(answer)) {
      await thread.send(errorMsg || 'Hmm, isso nao parece certo. Tenta de novo?')
      return tryCollect()
    }

    return answer
  }

  return tryCollect()
}

async function askButtons(
  thread: ThreadChannel,
  userId: string,
  question: string,
  options: { label: string; value: string }[]
): Promise<string> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    options.map((opt) =>
      new ButtonBuilder()
        .setCustomId(`onb_${userId}_${opt.value}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Secondary)
    )
  )

  const msg = await thread.send({ content: question, components: [row] })

  const interaction = await msg.awaitMessageComponent({
    componentType: ComponentType.Button,
    time: TIMEOUT,
    filter: (i) => i.user.id === userId,
  }) as ButtonInteraction

  const selectedValue = interaction.customId.replace(`onb_${userId}_`, '')

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    options.map((opt) =>
      new ButtonBuilder()
        .setCustomId(`onb_${userId}_${opt.value}`)
        .setLabel(opt.label)
        .setStyle(opt.value === selectedValue ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(true)
    )
  )
  await interaction.update({ components: [disabledRow] })

  return selectedValue
}

async function askMultiSelect(
  thread: ThreadChannel,
  userId: string,
  question: string,
  options: { label: string; value: string }[]
): Promise<string[]> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`onb_select_${userId}`)
    .setPlaceholder('Seleciona as que voce usa')
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options)

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  const msg = await thread.send({ content: question, components: [row] })

  const interaction = await msg.awaitMessageComponent({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT,
    filter: (i) => i.user.id === userId,
  }) as StringSelectMenuInteraction

  await interaction.update({
    content: `${question}\n✅ **${interaction.values.join(', ')}**`,
    components: [],
  })

  return interaction.values
}

async function runQuestions(thread: ThreadChannel, member: GuildMember, isOG: boolean): Promise<void> {
  const userId = member.id

  // Intro na thread
  await thread.send(
    '🔒 **Voce ta na porta do servidor.**\n\n' +
    'Responde umas perguntas rapidas aqui pra desbloquear o acesso completo.\n' +
    'Bora? 🔥\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━'
  )

  // 1. Nome
  const name = await askText(thread, userId, '**1.** Qual teu nome?')
  await thread.send(`Show, **${name}**! Bora continuar 🔥`)

  // 2. Email
  const email = await askText(
    thread, userId,
    '**2.** Teu melhor email?',
    isValidEmail,
    'Hmm, isso nao parece um email valido. Tenta de novo?'
  )
  await thread.send('Anotado ✅')

  // 3. WhatsApp
  const whatsappRaw = await askText(
    thread, userId,
    '**3.** Teu WhatsApp com DDD? (ex: 51999998888)',
    (input) => normalizePhone(input) !== null,
    'Preciso do numero com DDD (11 digitos). Ex: 51999998888'
  )
  const whatsapp = normalizePhone(whatsappRaw)!
  await thread.send('📱 Salvo!')

  // 4. Nivel tecnico
  const nivel = await askButtons(thread, userId, '**4.** Qual teu nivel hoje?', [
    { label: '🌱 Iniciante', value: 'iniciante' },
    { label: '⚡ Intermediario', value: 'intermediario' },
    { label: '🚀 Avancado', value: 'avancado' },
  ])

  // 5. Ferramentas
  const ferramentas = await askMultiSelect(
    thread, userId,
    '**5.** Quais ferramentas voce usa?',
    [
      { label: 'Claude Code', value: 'claude-code' },
      { label: 'Codex', value: 'codex' },
      { label: 'Lovable', value: 'lovable' },
      { label: 'Cursor', value: 'cursor' },
      { label: 'Bolt', value: 'bolt' },
      { label: 'Outra', value: 'outra' },
    ]
  )

  // 6. Objetivo
  const objetivo = await askButtons(thread, userId, '**6.** Qual teu objetivo principal?', [
    { label: '📚 Aprender a codar', value: 'codar' },
    { label: '💡 Criar SaaS', value: 'saas' },
    { label: '💼 Freelance', value: 'freelance' },
    { label: '⚙️ Automatizar negocio', value: 'automatizar' },
  ])

  // 7. Faixa de renda
  const faixa = await askButtons(thread, userId, '**7.** Ja ganha dinheiro com software?', [
    { label: 'Nao ainda', value: 'nao' },
    { label: 'Ate R$1k/mes', value: 'ate-1k' },
    { label: 'R$1k-5k', value: '1k-5k' },
    { label: 'R$5k-10k', value: '5k-10k' },
    { label: '+R$10k', value: '10k-plus' },
  ])

  // 8. Maior dificuldade
  const dor = await askButtons(thread, userId, '**8.** Qual tua maior dificuldade hoje?', [
    { label: '💰 Aprender a vender', value: 'vender' },
    { label: '🛠️ Construir o produto', value: 'construir' },
    { label: '🧠 Saber o que criar', value: 'ideia' },
    { label: '⏰ Ter tempo/foco', value: 'tempo' },
    { label: '📣 Conseguir clientes', value: 'clientes' },
  ])

  // 9. Como conheceu
  const fonte = await askButtons(thread, userId, '**9.** Como me conheceu?', [
    { label: '📺 YouTube', value: 'youtube' },
    { label: '🤝 Indicacao', value: 'indicacao' },
    { label: '📱 Rede social', value: 'rede-social' },
    { label: '🔍 Outro', value: 'outro' },
  ])

  // 10. Pergunta aberta (texto livre)
  await thread.sendTyping().catch(() => {})
  console.log(`[ZERO] Pergunta 10 (texto livre) para ${member.user.tag}`)
  const oQueQuer = await askText(
    thread, userId,
    '**Ultima pergunta!**\n\n' +
    '**O que voce quer que eu crie/venda pra voce?**\n' +
    'O que voce quer consumir de mim? Pode mandar tudo, sem filtro.\n\n' +
    '👇 **Digita tua resposta aqui embaixo:**'
  )
  console.log(`[ZERO] Resposta recebida de ${member.user.tag}: "${oQueQuer.slice(0, 50)}..."`)
  await thread.send('✅ Anotado! Processando teu acesso...')

  // Monta dados
  const data: OnboardingData = {
    discord_id: userId,
    discord_username: member.user.tag,
    name,
    email,
    whatsapp,
    nivel_tecnico: nivel,
    ferramentas,
    objetivo,
    faixa_renda: faixa,
    maior_dificuldade: dor,
    como_conheceu: fonte,
    o_que_quer: oQueQuer,
  }

  // Sync pro AC
  await syncToAC(data)

  // Libera acesso
  if (config.roleMember) {
    await member.roles.add(config.roleMember).catch(() => {})
  }
  if (config.roleNewcomer) {
    await member.roles.remove(config.roleNewcomer).catch(() => {})
  }
  if (isOG && config.roleOG) {
    await member.roles.add(config.roleOG).catch(() => {})
  }

  // Mensagem final
  await thread.send(
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    `🔓 **ACESSO LIBERADO, ${name}!**\n\n` +
    (isOG ? '🏆 Voce ganhou o cargo **OG** — Original Gangster. Respeito.\n\n' : '') +
    `Agora vai no <#${config.channelGeneral}> e se apresenta pra galera!\n\n` +
    'Cola esse prompt no teu ChatGPT ou Claude pra criar uma apresentacao personalizada:\n\n' +
    '```\n' +
    'Ola! Eu acabei de entrar no Discord de um cara que ta fazendo live coding todos os dias. ' +
    'Ele ta construindo uma plataforma de agente vertical. ' +
    'BASEADO em TODO meu historico que eu tenho de conversas aqui contigo, ' +
    'crie uma mensagem de apresentacao sobre a minha pessoa pra que eu poste no Discord em apresentacoes. ' +
    'Eu quero aproveitar essa nova comunidade para me integrar no mercado, fazer conexoes e ir muito alem.\n' +
    '```\n\n' +
    '👆 Copia, cola na IA, e posta o resultado la. Bora! 🚀'
  )

  // Arquiva thread apos 30s
  setTimeout(async () => {
    await thread.setArchived(true).catch(() => {})
  }, 30_000)

  // Anuncia no geral
  if (config.channelGeneral) {
    const generalChannel = member.guild.channels.cache.get(config.channelGeneral)
    if (generalChannel?.isTextBased() && 'send' in generalChannel) {
      await (generalChannel as any).send(
        `🆕 **${name}** acabou de entrar no servidor! Boas-vindas! 🔥`
      )
    }
  }

  console.log(`[ZERO] Onboarding completo: ${member.user.tag} (${name})`)
}

export async function startOnboarding(member: GuildMember, isOG = false): Promise<void> {
  const userId = member.id

  if (sessions.has(userId)) return
  sessions.set(userId, true)

  const gatekeeperChannel = member.guild.channels.cache.get(config.channelGatekeeper) as TextChannel
  if (!gatekeeperChannel) {
    console.error('[ZERO] Canal #gatekeeper nao encontrado')
    sessions.delete(userId)
    return
  }

  try {
    // Mensagem de boas-vindas no #gatekeeper com botao
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`start_onboarding_${userId}`)
        .setLabel('🔓 Comecar onboarding')
        .setStyle(ButtonStyle.Success)
    )

    const welcomeMsg = await gatekeeperChannel.send({
      content:
        `Hey <@${userId}>! Bem-vindo! 👋\n\n` +
        '🔒 Pra desbloquear os canais, preciso te conhecer rapidinho.\n' +
        'Leva menos de 2 minutos.\n\n' +
        '**Clica no botao abaixo pra comecar** 👇',
      components: [row],
    })

    // Espera o clique no botao
    const btnInteraction = await welcomeMsg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: TIMEOUT,
      filter: (i) => i.user.id === userId && i.customId === `start_onboarding_${userId}`,
    })

    // Cria thread privada
    const thread = await gatekeeperChannel.threads.create({
      name: `onboarding-${member.user.username}`,
      type: ChannelType.PrivateThread,
      reason: `Onboarding de ${member.user.tag}`,
    })
    await thread.members.add(userId)

    // Responde a interacao com link direto pra thread
    await btnInteraction.reply({
      content: `Bora! Vai pra ca 👉 <#${thread.id}>`,
      ephemeral: true,
    })

    // Desabilita botao no gatekeeper
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`start_onboarding_${userId}`)
        .setLabel('✅ Questionario iniciado')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    )
    await welcomeMsg.edit({ components: [disabledRow] })

    // Roda perguntas na thread
    await runQuestions(thread, member, isOG)
  } catch (err) {
    if ((err as Error).message === 'timeout') {
      await gatekeeperChannel.send(
        `<@${userId}> ⏰ Timeout! Sai e entra no servidor de novo pra recomecar.`
      ).catch(() => {})
    } else {
      console.error(`[ZERO] Erro no onboarding de ${member.user.tag}:`, err)
    }
  } finally {
    sessions.delete(userId)
  }
}
