# CLAUDE.md — emailhacker-discord

## O que e este projeto

Bot Discord "ZERO" — gatekeeper da comunidade EmailHacker. Onboarding automatico de novos membros com 10 perguntas, sync com ActiveCampaign e Supabase.

## Comandos

```bash
npm run dev      # dev com hot reload (tsx watch)
npm run build    # compila TypeScript
npm start        # roda o bot (node dist/index.js)
```

## Deploy

- **Coolify** (Docker) — app UUID: `b4hue1u3dnqqamaql1hnnmmb`
- **NUNCA usar restart** — sempre stop + start (rolling update causa container duplo com mesmo bot token = mensagens duplicadas)
- Deploy via Coolify API:
  - `POST /api/v1/applications/{uuid}/stop`
  - `POST /api/v1/applications/{uuid}/start`
- Credenciais Coolify em `~/.secrets/emailhacker` (`COOLIFY_BASE_URL` e `COOLIFY_API_TOKEN`)

## Arquitetura

- `src/index.ts` — ponto de entrada, listeners de eventos Discord
- `src/config.ts` — carrega secrets (env vars no Docker, `~/.secrets/emailhacker` em dev)
- `src/handlers/onboarding.ts` — fluxo de 10 perguntas em thread privada
- `src/handlers/og-invite.ts` — convite OG para membros originais
- `src/services/ac-sync.ts` — sync com ActiveCampaign (contact/sync, custom fields, tags)
- `src/services/supabase.ts` — CRUD tabela `discord_onboarding` (saves incrementais)
- `src/utils/validators.ts` — validacao de email e telefone

## Fluxo de onboarding

1. `GuildMemberAdd` → atribui role `newcomer` → cria thread privada no `#gatekeeper`
2. 10 perguntas corridas (text, buttons, multi-select) com timeout de 10min
3. Apos Q3 (email+whatsapp): cria contato no AC em background com tag `discord-member`
4. Cada resposta: salva Supabase + update AC field em background
5. **Mensagem final ANTES de trocar roles** (usuario perde acesso ao gatekeeper ao virar `member`)
6. Troca roles, anuncia no `#general`, marca completo no AC e Supabase

## Integracoes

- **Supabase** (projeto `waawkqvfkzblsogemjlw`): tabela `discord_onboarding`
- **ActiveCampaign** (conta laschuk): lista 83 (All), campos `[DISC] *`, tags `discord-member` e `discord-onboarding-completo`

## Resiliencia

- **Crash handlers:** `uncaughtException` loga e faz exit(1), `unhandledRejection` loga sem matar o processo
- **Container restart:** Coolify reinicia o container automaticamente se o processo morrer
- **Health check desabilitado:** bot nao tem HTTP server, health check causava falso `unhealthy`
- **Reconexao Discord:** discord.js reconecta automaticamente se o WebSocket cair

## Cuidados

- O `sessions` Map em memoria protege contra eventos duplicados, mas reseta no restart
- Se o bot reconectar ao Discord, pode receber eventos pendentes — o Map impede duplicacao dentro da mesma sessao
- Timeout inteligente: se ja respondeu Q1-Q3 (nome/email/whatsapp) e deu timeout, libera acesso direto. Se nao completou Q3, mostra botao "Continuar onboarding" (ativo 24h)
- Thread privada fica aberta apos onboarding (usuario fecha quando quiser)
- **NUNCA deletar a app do Coolify** sem confirmar que o bot nao esta rodando em outra sessao
