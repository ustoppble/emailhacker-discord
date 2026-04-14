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
import { syncGateToAC, updateACField, markACOnboardingComplete } from '../services/ac-sync'
import { isValidEmail, normalizePhone } from '../utils/validators'
import {
  getOnboardingRecord,
  createOnboardingRecord,
  saveOnboardingAnswer,
  markGateComplete,
  markOnboardingCompleted,
  markOnboardingTimeout,
  OnboardingRecord,
} from '../services/supabase'

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

async function runQuestions(
  thread: ThreadChannel,
  member: GuildMember,
  isOG: boolean,
  existing: OnboardingRecord | null
): Promise<void> {
  const userId = member.id
  const startStep = existing?.current_step ?? 0

  // Intro
  if (startStep >= 3) {
    await thread.send(
      '🔄 **Bora continuar de onde parou!**\n\n' +
      `Faltam ${10 - startStep} perguntas pra completar teu perfil. 🔥\n\n` +
      '━━━━━━━━━━━━━━━━━━━━━'
    )
  } else if (startStep > 0) {
    await thread.send(
      '🔄 **Opa, voce ja tinha comecado!**\n\n' +
      'Bora continuar de onde parou. 🔥\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━'
    )
  } else {
    await thread.send(
      '🔒 **Voce ta na porta do servidor.**\n\n' +
      'Responde 3 perguntas rapidas pra desbloquear o acesso.\n' +
      'Leva menos de 30 segundos. Bora? 🔥\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━'
    )
  }

  // ===== GATE: Q1-3 (obrigatórias para acesso) =====

  // Step 0: Nome
  let name: string
  if (startStep <= 0) {
    name = await askText(thread, userId, '**1.** Qual teu nome?')
    await saveOnboardingAnswer(userId, 'name', name, 1)
    await thread.send(`Show, **${name}**! Bora continuar 🔥`)
  } else {
    name = existing!.name!
  }

  // Step 1: Email
  let email: string
  if (startStep <= 1) {
    email = await askText(
      thread, userId,
      '**2.** Teu melhor email?',
      isValidEmail,
      'Hmm, isso nao parece um email valido. Tenta de novo?'
    )
    await saveOnboardingAnswer(userId, 'email', email, 2)
    await thread.send('Anotado ✅')
  } else {
    email = existing!.email!
  }

  // Step 2: WhatsApp
  let whatsapp: string
  if (startStep <= 2) {
    const whatsappRaw = await askText(
      thread, userId,
      '**3.** Teu WhatsApp com DDD? (ex: 51999998888)',
      (input) => normalizePhone(input) !== null,
      'Preciso do numero com DDD (11 digitos). Ex: 51999998888'
    )
    whatsapp = normalizePhone(whatsappRaw)!
    await saveOnboardingAnswer(userId, 'whatsapp', whatsapp, 3)
  } else {
    whatsapp = existing!.whatsapp!
  }

  // ===== GATE PASSADO: libera acesso =====
  if (startStep <= 2) {
    // Sync pro AC (cria contato + tag parcial)
    await syncGateToAC({
      email, name, whatsapp,
      discord_id: userId,
      discord_username: member.user.tag,
    })

    // Marca gate completo no Supabase
    await markGateComplete(userId)

    // Libera roles
    if (config.roleMember) {
      await member.roles.add(config.roleMember).catch(() => {})
    }
    if (config.roleNewcomer) {
      await member.roles.remove(config.roleNewcomer).catch(() => {})
    }
    if (isOG && config.roleOG) {
      await member.roles.add(config.roleOG).catch(() => {})
    }

    // Anuncia no geral
    if (config.channelGeneral) {
      const generalChannel = member.guild.channels.cache.get(config.channelGeneral)
      if (generalChannel?.isTextBased() && 'send' in generalChannel) {
        await (generalChannel as any).send(
          `🆕 **${name}** acabou de entrar no servidor! Boas-vindas! 🔥`
        )
      }
    }

    await thread.send(
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      `🔓 **ACESSO LIBERADO, ${name}!**\n\n` +
      (isOG ? '🏆 Voce ganhou o cargo **OG** — Original Gangster. Respeito.\n\n' : '') +
      'Agora me ajuda a te ajudar melhor — responde mais umas perguntas rapidas?\n' +
      'Teu acesso ja ta liberado, isso aqui e pra eu te conhecer melhor. 👇'
    )
  }

  // ===== PERFIL: Q4-10 (opcionais mas incentivadas) =====
  // Wrap em try/catch — timeout aqui não bloqueia acesso
  try {
    // Step 3: Nivel tecnico
    let nivel: string
    if (startStep <= 3) {
      nivel = await askButtons(thread, userId, '**4.** Qual teu nivel hoje?', [
        { label: '🌱 Iniciante', value: 'iniciante' },
        { label: '⚡ Intermediario', value: 'intermediario' },
        { label: '🚀 Avancado', value: 'avancado' },
      ])
      await saveOnboardingAnswer(userId, 'nivel_tecnico', nivel, 4)
      await updateACField(email, 'nivel_tecnico', nivel)
    } else {
      nivel = existing!.nivel_tecnico!
    }

    // Step 4: Ferramentas
    let ferramentas: string[]
    if (startStep <= 4) {
      ferramentas = await askMultiSelect(
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
      await saveOnboardingAnswer(userId, 'ferramentas', ferramentas, 5)
      await updateACField(email, 'ferramentas', ferramentas.join(', '))
    } else {
      ferramentas = existing!.ferramentas!
    }

    // Step 5: Objetivo
    let objetivo: string
    if (startStep <= 5) {
      objetivo = await askButtons(thread, userId, '**6.** Qual teu objetivo principal?', [
        { label: '📚 Aprender a codar', value: 'codar' },
        { label: '💡 Criar SaaS', value: 'saas' },
        { label: '💼 Freelance', value: 'freelance' },
        { label: '⚙️ Automatizar negocio', value: 'automatizar' },
      ])
      await saveOnboardingAnswer(userId, 'objetivo', objetivo, 6)
      await updateACField(email, 'objetivo', objetivo)
    } else {
      objetivo = existing!.objetivo!
    }

    // Step 6: Faixa de renda
    if (startStep <= 6) {
      const faixa = await askButtons(thread, userId, '**7.** Ja ganha dinheiro com software?', [
        { label: 'Nao ainda', value: 'nao' },
        { label: 'Ate R$1k/mes', value: 'ate-1k' },
        { label: 'R$1k-5k', value: '1k-5k' },
        { label: 'R$5k-10k', value: '5k-10k' },
        { label: '+R$10k', value: '10k-plus' },
      ])
      await saveOnboardingAnswer(userId, 'faixa_renda', faixa, 7)
      await updateACField(email, 'faixa_renda', faixa)
    }

    // Step 7: Maior dificuldade
    if (startStep <= 7) {
      const dor = await askButtons(thread, userId, '**8.** Qual tua maior dificuldade hoje?', [
        { label: '💰 Aprender a vender', value: 'vender' },
        { label: '🛠️ Construir o produto', value: 'construir' },
        { label: '🧠 Saber o que criar', value: 'ideia' },
        { label: '⏰ Ter tempo/foco', value: 'tempo' },
        { label: '📣 Conseguir clientes', value: 'clientes' },
      ])
      await saveOnboardingAnswer(userId, 'maior_dificuldade', dor, 8)
      await updateACField(email, 'maior_dificuldade', dor)
    }

    // Step 8: Como conheceu
    if (startStep <= 8) {
      const fonte = await askButtons(thread, userId, '**9.** Como me conheceu?', [
        { label: '📺 YouTube', value: 'youtube' },
        { label: '🤝 Indicacao', value: 'indicacao' },
        { label: '📱 Rede social', value: 'rede-social' },
        { label: '🔍 Outro', value: 'outro' },
      ])
      await saveOnboardingAnswer(userId, 'como_conheceu', fonte, 9)
      await updateACField(email, 'como_conheceu', fonte)
    }

    // Step 9: Pergunta aberta
    if (startStep <= 9) {
      await thread.sendTyping().catch(() => {})
      const oQueQuer = await askText(
        thread, userId,
        '**Ultima pergunta!**\n\n' +
        '**O que voce quer que eu crie/venda pra voce?**\n' +
        'O que voce quer consumir de mim? Pode mandar tudo, sem filtro.\n\n' +
        '👇 **Digita tua resposta aqui embaixo:**'
      )
      await saveOnboardingAnswer(userId, 'o_que_quer', oQueQuer, 10)
      await updateACField(email, 'o_que_quer', oQueQuer)
    }

    // ===== PERFIL COMPLETO =====
    await markOnboardingCompleted(userId)
    await markACOnboardingComplete(email, nivel, objetivo)

    await thread.send(
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '✅ **Perfil completo!** Valeu por responder tudo.\n\n' +
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

    console.log(`[ZERO] Onboarding completo: ${member.user.tag} (${name})`)

  } catch (err) {
    if ((err as Error).message === 'timeout') {
      // Timeout nas perguntas bônus — acesso já foi dado, tá OK
      console.log(`[ZERO] Timeout nas perguntas bonus: ${member.user.tag}`)
      await thread.send(
        '⏰ Sem problemas! Teu acesso ja ta liberado.\n' +
        'Quando quiser completar o perfil, e so mandar uma DM pro bot. 👋'
      ).catch(() => {})

      // Arquiva thread
      setTimeout(async () => {
        await thread.setArchived(true).catch(() => {})
      }, 10_000)
    } else {
      throw err // Propaga erros reais
    }
  }
}

/**
 * Envia mensagem de boas-vindas no #gatekeeper com botão.
 * O clique do botão é tratado por handleOnboardingClick (chamado do index.ts).
 */
export async function startOnboarding(member: GuildMember, isOG = false): Promise<void> {
  const userId = member.id

  const gatekeeperChannel = member.guild.channels.cache.get(config.channelGatekeeper) as TextChannel
  if (!gatekeeperChannel) {
    console.error('[ZERO] Canal #gatekeeper nao encontrado')
    return
  }

  // Verifica estado no Supabase
  const existing = await getOnboardingRecord(userId)

  if (existing?.status === 'completed') {
    // Já completou — só garante roles
    if (config.roleMember) await member.roles.add(config.roleMember).catch(() => {})
    if (config.roleNewcomer) await member.roles.remove(config.roleNewcomer).catch(() => {})
    return
  }

  const isResume = existing && existing.current_step > 0
  const isPastGate = existing && existing.current_step >= 3

  // Mensagem no gatekeeper com botão
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_onboarding_${userId}${isOG ? '_og' : ''}`)
      .setLabel(isPastGate ? '🔄 Completar perfil' : isResume ? '🔄 Continuar onboarding' : '🔓 Comecar onboarding')
      .setStyle(ButtonStyle.Success)
  )

  await gatekeeperChannel.send({
    content: isPastGate
      ? `Hey <@${userId}>! Teu acesso ja ta liberado. 👋\n\n` +
        'Quer completar teu perfil? Responde mais umas perguntas rapidas.\n\n' +
        '**Clica no botao abaixo** 👇'
      : isResume
        ? `Hey <@${userId}>! Voce ja tinha comecado. 👋\n\n` +
          '🔄 Bora continuar de onde parou?\n\n' +
          '**Clica no botao abaixo** 👇'
        : `Hey <@${userId}>! Bem-vindo! 👋\n\n` +
          '🔒 Pra desbloquear os canais, responde 3 perguntas rapidas.\n' +
          'Leva menos de 30 segundos.\n\n' +
          '**Clica no botao abaixo pra comecar** 👇',
    components: [row],
  })
}

/**
 * Tratado pelo InteractionCreate global no index.ts.
 * Cria thread e roda o questionário.
 */
export async function handleOnboardingClick(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id
  const isOG = interaction.customId.includes('_og')

  if (sessions.has(userId)) {
    await interaction.reply({ content: 'Voce ja tem um questionario em andamento!', ephemeral: true })
    return
  }
  sessions.set(userId, true)

  const guild = interaction.guild
  if (!guild) {
    sessions.delete(userId)
    return
  }

  const member = await guild.members.fetch(userId).catch(() => null)
  if (!member) {
    sessions.delete(userId)
    return
  }

  const gatekeeperChannel = guild.channels.cache.get(config.channelGatekeeper) as TextChannel
  if (!gatekeeperChannel) {
    sessions.delete(userId)
    return
  }

  try {
    // Verifica estado
    let existing = await getOnboardingRecord(userId)

    if (!existing || existing.status === 'timeout') {
      await createOnboardingRecord(userId, member.user.tag)
      existing = null
    }

    // Cria thread privada
    const thread = await gatekeeperChannel.threads.create({
      name: `onboarding-${member.user.username}`,
      type: ChannelType.PrivateThread,
      reason: `Onboarding de ${member.user.tag}`,
    })
    await thread.members.add(userId)

    // Responde à interação
    await interaction.reply({
      content: `Bora! Vai pra ca 👉 <#${thread.id}>`,
      ephemeral: true,
    })

    // Desabilita botão
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(interaction.customId)
        .setLabel('✅ Questionario iniciado')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    )
    await interaction.message.edit({ components: [disabledRow] }).catch(() => {})

    // Roda questionário
    await runQuestions(thread, member, isOG, existing)
  } catch (err) {
    if ((err as Error).message === 'timeout') {
      // Timeout no gate (Q1-3) — não tem acesso ainda
      await markOnboardingTimeout(userId)
      await gatekeeperChannel.send(
        `<@${userId}> ⏰ Timeout! Quando quiser, clica no botao de novo ou manda uma DM pro bot.`
      ).catch(() => {})
    } else {
      console.error(`[ZERO] Erro no onboarding de ${member.user.tag}:`, err)
    }
  } finally {
    sessions.delete(userId)
  }
}
