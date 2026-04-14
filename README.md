# emailhacker-discord

Bot ZERO — gatekeeper da comunidade EmailHacker no Discord.

## O que faz

Bot Discord (discord.js v14) que gerencia entrada de novos membros. Quando alguém entra no servidor:

1. Recebe role `newcomer` e vê apenas o `#gatekeeper`
2. Bot cria thread privada e faz 10 perguntas (nome, email, whatsapp, nível, ferramentas, objetivo, renda, dificuldade, fonte, o que quer)
3. Após Q3 (email/whatsapp): cria contato no ActiveCampaign em background com tag `discord-member`
4. Cada resposta Q4-10: salva no Supabase + atualiza campo customizado no AC em background
5. Após Q10: envia mensagem final com prompt de apresentação, troca roles (`newcomer` → `member`), anuncia no `#general`

## Estrutura

```
src/
  index.ts              — entrada: eventos GuildMemberAdd + MessageCreate
  config.ts             — carrega env vars (secrets central ou process.env)
  handlers/
    onboarding.ts       — fluxo de 10 perguntas (text, buttons, multi-select)
    og-invite.ts        — convite OG pra membros que entraram antes do gatekeeper
  services/
    ac-sync.ts          — sync com ActiveCampaign (contact/sync, fields, tags)
    supabase.ts         — CRUD na tabela discord_onboarding (saves incrementais)
  utils/
    validators.ts       — validação de email e telefone
```

## Deploy

Roda no **Coolify** (Docker) na VPS. Conexão WebSocket com Discord API (sem porta HTTP exposta).

**IMPORTANTE:** Sempre usar **stop + start** no Coolify, nunca restart. Rolling update mantém 2 containers vivos com o mesmo bot token → mensagens duplicadas.

```bash
# Dev local
npm install && npm run dev

# Build
npm run build && node dist/index.js
```

## Variáveis de ambiente

Em dev: carrega de `~/.secrets/emailhacker`. No Coolify: env vars no painel.

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DISCORD_BOT_TOKEN` | Sim | Token do bot Discord |
| `DISCORD_CLIENT_ID` | Sim | Client ID da app Discord |
| `DISCORD_GUILD_ID` | Sim | ID do servidor |
| `DISCORD_ROLE_NEWCOMER` | Sim | Role atribuída ao entrar |
| `DISCORD_ROLE_MEMBER` | Sim | Role após completar onboarding |
| `DISCORD_ROLE_OG` | Sim | Role pra membros originais |
| `DISCORD_CHANNEL_GATEKEEPER` | Sim | Canal onde o bot posta boas-vindas |
| `DISCORD_CHANNEL_GENERAL` | Sim | Canal geral (anúncios + invite OG) |
| `AC_LASCHUK_ACCOUNT` | Sim | Conta ActiveCampaign (subdomain) |
| `AC_LASCHUK_API_KEY` | Sim | API key do ActiveCampaign |
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Service role key do Supabase |

## Stack

TypeScript, discord.js v14, ActiveCampaign API, Supabase (PostgreSQL).
