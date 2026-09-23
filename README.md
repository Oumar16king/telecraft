# Bot Weaver

Je veux créer une application de vibe coding conçue uniquement pour les bots Telegram.
Dans cette application, l'utilisateur fournit son propre token Telegram BotFather et discute avec l'IA pour créer et alimenter son bot en langage naturel.
Le bot créé n'est pas uniquement un chatbot IA : ça peut être plusieurs genres de bots (bot de calcul, de prédiction, de gestion de groupe, météo, etc.). Même si l'utilisateur veut créer un chatbot, il fournit son propre token et ses propres clés API tierces.
Architecture retenue : un hub central multi-tenant où tout s'exécute directement dans l'application sans VPS, avec une route webhook par bot (/api/bots/:bot_id/webhook), un studio de vibe coding avec aperçu et simulateur de chat Telegram, un gestionnaire de secrets/tokens pour chaque bot, et un moteur d'exécution de la logique du bot.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://telecraft.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/25409cb2-9c6f-49ce-a96e-33c027945746).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
