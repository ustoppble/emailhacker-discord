# emailhacker-discord

Bot ZERO — gatekeeper da comunidade EmailHacker no Discord.

## O que é

Bot Discord (discord.js v14) que gerencia entrada de membros na comunidade. Onboarding automático: atribui roles, verifica se tem conta AC, e sincroniza dados.

## Onde roda

- **VPS** (PM2 ou manual)
- **Servidor Discord:** EmailHacker community
- Conexão WebSocket com Discord API (sem porta HTTP)

## Funcionalidades

- Onboarding automático de novos membros (role newcomer → member)
- Convite OG pra membros especiais
- Sync com ActiveCampaign (verifica se contato existe)
- Setup de canais e roles
- Gatekeeper (valida acesso)

## Estrutura

```
src/
  index.ts              — entrada principal
  config.ts             — carrega variáveis de ambiente
  handlers/
    onboarding.ts       — fluxo de onboarding
    og-invite.ts        — convites OG
  services/
    ac-sync.ts          — sync com ActiveCampaign
  utils/
    validators.ts       — validações
```

## Variáveis de ambiente

Carrega de `~/.secrets/emailhacker` (local) ou `/root/.secrets/emailhacker` (VPS).

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DISCORD_BOT_TOKEN` | Sim | Token do bot Discord |
| `DISCORD_CLIENT_ID` | Sim | Client ID da app Discord |
| `DISCORD_GUILD_ID` | Sim | ID do servidor |
| `DISCORD_ROLE_NEWCOMER` | Sim | Role ID pra novos membros |
| `DISCORD_ROLE_MEMBER` | Sim | Role ID pra membros verificados |
| `DISCORD_ROLE_OG` | Sim | Role ID pra OGs |
| `DISCORD_CHANNEL_GATEKEEPER` | Sim | Canal de boas-vindas |
| `DISCORD_CHANNEL_GENERAL` | Sim | Canal geral |
| `AC_LASCHUK_ACCOUNT` | Não | Conta AC pra sync |
| `AC_LASCHUK_API_KEY` | Não | API key AC pra sync |
| `API_BASE_URL` | Não (default: `localhost:1337`) | URL do EmailHacker |

## Deploy

```bash
npm install && npm run build && node dist/index.js
```

Ou via PM2: `pm2 start dist/index.js --name zero-bot`

## Pendências

- [ ] Path `.secrets` hardcoded como `../../../.secrets` — ajustar pra `~/.secrets/emailhacker`

## Stack

TypeScript, discord.js v14, ActiveCampaign API.
