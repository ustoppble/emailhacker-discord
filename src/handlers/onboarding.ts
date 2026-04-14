import {
  StringSelectMenuBuilder,
  GuildMember,
  TextChannel,
  ThreadChannel,
  ChannelType,
  Message,
  ComponentType,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js'
import { config } from '../config'
import { syncGateToAC, updateACField, markACOnboardingComplete } from '../services/ac-sync'
import { isValidEmail, normalizePhone } from '../utils/validators'
import {
  getOnboardingRecord,
  createOnboardingRecord,
  saveOnboardingAnswer,
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
  if (startStep > 0) {
    await thread.send(
      '🔄 **Opa, voce ja tinha comecado!**\n\n' +
      `Bora continuar de onde parou (pergunta ${startStep + 1}/10). 🔥\n\n` +
      '━━━━━━━━━━━━━━━━━━━━━'
    )
  } else {
    await thread.send(
      '🔒 **Voce ta na porta do servidor.**\n\n' +
      'Responde umas perguntas rapidas pra desbloquear o acesso.\n' +
      'Leva menos de 2 minutos. Bora? 🔥\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━'
    )
  }

  // ===== 10 PERGUNTAS CORRIDAS =====

  // Step 0: Nome
  let name: string
  if (startStep <= 0) {
    name = await askText(thread, userId, '**1.** Qual teu nome?')
    await saveOnboardingAnswer(userId, 'name', name, 1)
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
    // AC sync em background — cria contato com nome+email+whatsapp+tag parcial
    syncGateToAC({ email, name, whatsapp, discord_id: userId, discord_username: member.user.tag })
      .catch((err) => console.error('[ZERO] Erro no AC gate sync:', err))
  } else {
    whatsapp = existing!.whatsapp!
  }

  // Step 3: Nivel tecnico
  let nivel: string
  if (startStep <= 3) {
    nivel = await askButtons(thread, userId, '**4.** Qual teu nivel hoje?', [
      { label: '🌱 Iniciante', value: 'iniciante' },
      { label: '⚡ Intermediario', value: 'intermediario' },
      { label: '🚀 Avancado', value: 'avancado' },
    ])
    await saveOnboardingAnswer(userId, 'nivel_tecnico', nivel, 4)
    updateACField(email, 'nivel_tecnico', nivel).catch(() => {})
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
    updateACField(email, 'ferramentas', ferramentas.join(', ')).catch(() => {})
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
    updateACField(email, 'objetivo', objetivo).catch(() => {})
  } else {
    objetivo = existing!.objetivo!
  }

  // Step 6: Faixa de renda
  let faixa: string
  if (startStep <= 6) {
    faixa = await askButtons(thread, userId, '**7.** Ja ganha dinheiro com software?', [
      { label: 'Nao ainda', value: 'nao' },
      { label: 'Ate R$1k/mes', value: 'ate-1k' },
      { label: 'R$1k-5k', value: '1k-5k' },
      { label: 'R$5k-10k', value: '5k-10k' },
      { label: '+R$10k', value: '10k-plus' },
    ])
    await saveOnboardingAnswer(userId, 'faixa_renda', faixa, 7)
    updateACField(email, 'faixa_renda', faixa).catch(() => {})
  } else {
    faixa = existing!.faixa_renda!
  }

  // Step 7: Maior dificuldade
  let dor: string
  if (startStep <= 7) {
    dor = await askButtons(thread, userId, '**8.** Qual tua maior dificuldade hoje?', [
      { label: '💰 Aprender a vender', value: 'vender' },
      { label: '🛠️ Construir o produto', value: 'construir' },
      { label: '🧠 Saber o que criar', value: 'ideia' },
      { label: '⏰ Ter tempo/foco', value: 'tempo' },
      { label: '📣 Conseguir clientes', value: 'clientes' },
    ])
    await saveOnboardingAnswer(userId, 'maior_dificuldade', dor, 8)
    updateACField(email, 'maior_dificuldade', dor).catch(() => {})
  } else {
    dor = existing!.maior_dificuldade!
  }

  // Step 8: Como conheceu
  let fonte: string
  if (startStep <= 8) {
    fonte = await askButtons(thread, userId, '**9.** Como me conheceu?', [
      { label: '📺 YouTube', value: 'youtube' },
      { label: '🤝 Indicacao', value: 'indicacao' },
      { label: '📱 Rede social', value: 'rede-social' },
      { label: '🔍 Outro', value: 'outro' },
    ])
    await saveOnboardingAnswer(userId, 'como_conheceu', fonte, 9)
    updateACField(email, 'como_conheceu', fonte).catch(() => {})
  } else {
    fonte = existing!.como_conheceu!
  }

  // Step 9: Pergunta aberta
  let oQueQuer: string
  if (startStep <= 9) {
    oQueQuer = await askText(
      thread, userId,
      '**10. Ultima pergunta!**\n\n' +
      '**O que voce quer que eu crie/venda pra voce?**\n' +
      'Pode mandar tudo, sem filtro.\n\n' +
      '👇 **Digita tua resposta aqui embaixo:**'
    )
    await saveOnboardingAnswer(userId, 'o_que_quer', oQueQuer, 10)
    updateACField(email, 'o_que_quer', oQueQuer).catch(() => {})
  } else {
    oQueQuer = existing!.o_que_quer!
  }

  // ===== TUDO RESPONDIDO: manda mensagem final ANTES de trocar roles =====
  // (trocar roles remove acesso ao #gatekeeper, usuario perderia a thread)
  await thread.send(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    `🔓 **Canal liberado, ${name}!**\n\n` +
    (isOG ? '🏆 Voce ganhou o cargo **OG** — Original Gangster. Respeito.\n\n' : '') +
    `Agora te apresenta no <#${config.channelGeneral}> pro pessoal te conhecer!\n\n` +
    'Pra isso, cola o prompt abaixo no teu ChatGPT ou Claude — ele gera uma apresentacao personalizada baseada no teu historico:\n\n' +
    '```\n' +
    'Ola! Eu acabei de entrar no Discord de um cara que ta fazendo live coding todos os dias. ' +
    'Ele ta construindo uma plataforma de agente vertical. ' +
    'BASEADO em TODO meu historico que eu tenho de conversas aqui contigo, ' +
    'crie uma mensagem de apresentacao sobre a minha pessoa pra que eu poste no Discord em apresentacoes. ' +
    'Eu quero aproveitar essa nova comunidade para me integrar no mercado, fazer conexoes e ir muito alem.\n' +
    '```\n\n' +
    '👆 Copia, cola na IA, e posta o resultado la. Bora! 🚀'
  )

  // Libera roles (usuario perde acesso ao gatekeeper aqui)
  if (config.roleMember) {
    await member.roles.add(config.roleMember).catch(() => {})
  }
  if (config.roleNewcomer) {
    await member.roles.remove(config.roleNewcomer).catch(() => {})
  }
  if (isOG && config.roleOG) {
    await member.roles.add(config.roleOG).catch(() => {})
  }

  // Marca completo + anúncio em BACKGROUND (AC já foi sync incrementalmente)
  Promise.all([
    markOnboardingCompleted(userId),
    markACOnboardingComplete(email),
    (async () => {
      if (config.channelGeneral) {
        const generalChannel = member.guild.channels.cache.get(config.channelGeneral)
        if (generalChannel?.isTextBased() && 'send' in generalChannel) {
          await (generalChannel as any).send(
            `🆕 **${name}** acabou de entrar no servidor! Boas-vindas! 🔥`
          )
        }
      }
    })(),
  ]).catch((err) => console.error('[ZERO] Erro no sync background:', err))

  console.log(`[ZERO] Onboarding completo: ${member.user.tag} (${name})`)
}

/**
 * Cria thread privada no #gatekeeper e roda o questionário direto.
 * Sem mensagem pública, sem botão — só a pessoa e o bot veem a thread.
 */
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
    // Verifica estado no Supabase
    let existing = await getOnboardingRecord(userId)

    if (existing?.status === 'completed') {
      if (config.roleMember) await member.roles.add(config.roleMember).catch(() => {})
      if (config.roleNewcomer) await member.roles.remove(config.roleNewcomer).catch(() => {})
      sessions.delete(userId)
      return
    }

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

    // Boas-vindas no gatekeeper com link pra thread (fica visível — prova social)
    await gatekeeperChannel.send(
      `Hey <@${userId}>! Bem-vindo! 👋\n\n` +
      `Responde umas perguntas rapidas pra desbloquear o acesso 👉 <#${thread.id}>`
    )

    // Roda questionário na thread
    await runQuestions(thread, member, isOG, existing)
  } catch (err) {
    if ((err as Error).message === 'timeout') {
      await markOnboardingTimeout(userId)
    } else {
      console.error(`[ZERO] Erro no onboarding de ${member.user.tag}:`, err)
    }
  } finally {
    sessions.delete(userId)
  }
}
