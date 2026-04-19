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
  heartbeat.ts          — upsert em worker_heartbeats a cada 60s (cockpit monitora)
  activity-log.ts       — logActivity() + hashEmail() para activity_log granular
  http-server.ts        — HTTP control plane pro JARVIS (bearer auth, 4 endpoints)
  utils/
    validators.ts       — validação de email e telefone
```

## Persistencia

Bot escreve no **Supabase Brain** (`atrqyavpbjwpjsewwcrj`), mesmo projeto do cockpit/Overclock. Tabelas:

- `discord_onboarding` — 1 row por usuario, updates incrementais por pergunta
- `worker_heartbeats` — 1 row `worker_id='discord'`, upsert a cada 60s com `guilds` e `uptime` em `metadata` (permite cockpit saber se o bot esta vivo sem HTTP; `uptime` zera no restart → serve de prova de deploy)
- `activity_log` — 1 row por evento granular do onboarding (`source='discord'`), consumido pelo cockpit em tempo real

### Eventos `activity_log` emitidos

| `action` | Quando | `metadata` principal |
|----------|--------|----------------------|
| `onboarding_started` | Thread privada criada apos `GuildMemberAdd` | `discord_user_id`, `username` |
| `question_answered` | Cada resposta de Q1–Q10 | `step`, `question_key`, `email_hash` (SHA-256 truncado 16) |
| `sync_to_ac` | Contato criado/atualizado no ActiveCampaign apos Q3 | `ac_contact_id`, `email_hash` |
| `onboarding_completed` | Apos Q10, antes da troca de roles | `took_ms`, `ac_contact_id` |
| `onboarding_abandoned` | Timeout de 10min sem completar Q3 | `last_step`, `reason` |

Emails **nunca** entram no `activity_log` em claro — sempre `email_hash` (SHA-256, primeiros 16 chars). Payload limitado a 2000 chars (trunca para `{_truncated: true, action}` se exceder).

## Deploy

Roda no **Coolify** (Docker) na VPS. Conexao WebSocket com Discord API (sem porta HTTP exposta).

**IMPORTANTE:** Sempre usar **stop + start** no Coolify, nunca restart. Rolling update mantem 2 containers vivos com o mesmo bot token → mensagens duplicadas.

```bash
# Dev local
npm install && npm run dev

# Build
npm run build && node dist/index.js

# Deploy (via Coolify API)
POST /api/v1/applications/{uuid}/stop
POST /api/v1/applications/{uuid}/start
```

## Resiliencia

- **Crash handlers:** `uncaughtException` loga e reinicia, `unhandledRejection` loga sem matar
- **Auto-restart:** Container reinicia automaticamente se o processo morrer
- **Health check desabilitado:** bot nao tem HTTP server
- **Reconexao:** discord.js reconecta WebSocket automaticamente
- **Timeout inteligente:** se ja respondeu nome/email/whatsapp e deu timeout, libera acesso direto

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
| `SUPABASE_BRAIN_URL` | Sim | URL do projeto Brain (`atrqyavpbjwpjsewwcrj`) |
| `SUPABASE_BRAIN_SERVICE_KEY` | Sim | Service role key do Brain |
| `HTTP_PORT` | Opcional | Porta do HTTP server pro JARVIS (ex: `8787`). Se ausente, server nao sobe. |
| `BOT_HTTP_TOKEN` | Com HTTP_PORT | Bearer token pro JARVIS autenticar (random 32+ chars). |

## HTTP API (JARVIS control plane)

Sobe junto com o bot quando `HTTP_PORT` e `BOT_HTTP_TOKEN` estao setados. Auth: `Authorization: Bearer {BOT_HTTP_TOKEN}` em todas as rotas exceto `/health`.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | `{status, uptime_s, members_in_flight}` — sem auth |
| GET | `/members/pending` | Lista onboardings com `status != completed` |
| GET | `/members/:discordId/status` | 1 row + respostas + `gate_completed_at` |
| POST | `/members/:discordId/resume` | Reabre a pergunta atual. 409 se `completed`. Loga `resume_by_jarvis` em `activity_log` |
| POST | `/members/:discordId/nudge` | DM de lembrete. 409 se `completed`. Loga `nudge_by_jarvis` |

Erros: `404 not_found`, `401 unauthorized`, `409 already_completed`, `500 internal_error`. Nunca retorna stack.

## Stack

TypeScript, discord.js v14, ActiveCampaign API, Supabase (PostgreSQL).

## Status atual

- **Em producao** — rodando no Coolify (UUID `b4hue1u3dnqqamaql1hnnmmb`)
- **Ultimo deploy:** commit `ca83c2a` (activity logging granular, PR #20)
- **Observabilidade:** heartbeat + activity_log ambos ligados no Brain; cockpit Overclock pode renderizar membros, status de liveness e log de eventos sem HTTP endpoint no bot
- **Divida conhecida:** 37 rows orfas de `discord_onboarding` no Supabase de produto antigo ainda nao foram migradas para o Brain — usuario que retomar onboarding comecaria com row em branco no Brain
- **Sem retention policy em `activity_log`** — cresce ~14 rows por onboarding concluido, tolerado no volume atual
