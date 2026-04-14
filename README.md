# emailhacker-discord

Bot ZERO — Discord gatekeeper bot do [EmailHacker.ai](https://emailhacker.ai).

Gerencia o onboarding de novos membros no servidor Discord, sincroniza contatos com o ActiveCampaign e controla acesso por roles.

## Setup

```bash
npm install
```

Crie um arquivo `.env` na raiz com as variáveis necessárias (ver `src/config.ts`).

## Comandos

```bash
# Desenvolvimento (watch mode)
npm run dev

# Build
npm run build

# Produção
npm start
```

## Estrutura

```
src/
  index.ts              # Entrada principal (bot ZERO)
  config.ts             # Variáveis de ambiente
  handlers/
    onboarding.ts       # Fluxo de onboarding de novos membros
    og-invite.ts        # Convites OG
  services/
    ac-sync.ts          # Sincronização com ActiveCampaign
  utils/
    validators.ts       # Validações
```
