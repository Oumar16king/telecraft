# Telecraft — vrai studio de code pour bots Telegram

## Ce qui change dans l'idée

Aujourd'hui l'IA remplit une petite « fiche de comportement » (une liste de règles). C'est pour ça
que tu ne peux pas tout demander et qu'il n'y a pas de code à télécharger.

Nouvelle base : **chaque bot est un vrai projet de code**, composé de fichiers que l'IA écrit,
lit et modifie devant toi. Le bot tourne réellement sur ce code — aucune simulation, aucune
fiche de règles. Et tu peux télécharger le projet complet en `.zip`.

Les 3 clés OpenRouter servent uniquement au cerveau de Telecraft (l'IA qui code). Elles ne sont
jamais données aux bots : un bot qui a besoin d'une IA utilise la clé que tu ajoutes dans ses
propres clés.

## 1. Les bots deviennent de vrais projets de code

- Nouvelle table de fichiers par bot : chemin + contenu (`bot.js`, `commands/start.js`,
  `lib/telegram.js`, `README.md`, `package.json`…).
- Point d'entrée imposé : `bot.js` exporte `handleUpdate(update, api, env)`.
- À chaque message Telegram, l'application charge les fichiers du bot et exécute son code
  pour de vrai, avec accès : API Telegram complète (`api.call("sendMessage", …)`,
  `sendChatAction`, `banChatMember`, `sendPoll`, `editMessageText`, boutons inline, etc.),
  les clés du bot, une petite mémoire persistante (`env.store`) pour compteurs/votes/états,
  et `fetch` pour les API externes.
- Le webhook accepte tous les types de mises à jour (messages, canaux, boutons, membres qui
  rejoignent/quittent, votes, messages modifiés).
- Journal : chaque exécution enregistre ce que le bot a reçu, envoyé, et l'erreur éventuelle.

## 2. L'IA devient une véritable spécialiste Telegram

- Une base de connaissances intégrée au cerveau de l'IA : toutes les grandes familles de
  fonctionnalités (messages, médias, actions « en train d'écrire », claviers, inline, canaux et
  groupes, administration, votes/sondages, paiements, fichiers), les limites réelles
  (1 message/s par chat, ~30 messages/s global, 20 messages/min par groupe, 4096 caractères,
  tailles de fichiers, limites de callback), et les bonnes pratiques (répondre au webhook vite,
  toujours répondre aux `callback_query`, gérer les erreurs 429, idempotence).
- L'IA travaille par étapes : elle comprend l'objectif, liste ce que le projet exige, écrit/modifie
  les fichiers, puis vérifie le code avant de conclure.
- Elle livre un résultat prêt à l'emploi et te dit clairement les étapes humaines nécessaires
  (ex. « ajoute le bot comme administrateur de ton canal, puis donne-moi son identifiant »).
  Exemple « gestionnaire de canal » : configuration du canal, diffusion, votes, bannir/débannir,
  filtre anti-spam, planification — l'IA couvre l'ensemble d'elle-même.
- Recherche web : quand elle a besoin d'une info à jour (une API externe, un détail Telegram),
  elle cherche et tu vois la requête et ce qu'elle a trouvé.

## 3. Le chat devient vivant (streaming + activité en direct)

- Ton message apparaît immédiatement, avant que le travail commence.
- Pendant le travail, l'envoi est bloqué (le bouton devient « Stop ») jusqu'à la fin.
- La réponse arrive mot par mot.
- Chaque action de l'IA s'affiche en direct dans le fil, comme une ligne repliable :
  - « Réfléchi pendant 12 s » + `^` pour lire le raisonnement,
  - « Lu `bot.js` », « Modifié `commands/ban.js` », « Créé … », « Supprimé … » (avec le contenu
    visible en dépliant),
  - « Recherche web : … » + `^` pour voir la requête et les résultats.
- Tout reste visible après rechargement de la page (les étapes sont enregistrées).

## 4. Interface rangée

Studio en trois zones nettes :

```text
┌─ En-tête : nom du bot · @username · en ligne/hors ligne · [Télécharger .zip] ─┐
├───────────────── Chat avec l'IA ─────────────────┬──── Panneau droit ────────┤
│ messages + activité en direct                    │ Fichiers | Clés |         │
│                                                  │ Connexion | Versions |    │
│ [zone de saisie · Envoyer/Stop]                  │ Journal                   │
└──────────────────────────────────────────────────┴───────────────────────────┘
```

- Onglet **Fichiers** : arborescence du projet, lecture du contenu de chaque fichier.
- **Versions** : chaque modification de l'IA crée une version restaurable (tous les fichiers).
- **Clés** : les clés du bot uniquement.
- **Connexion** : token, mise en ligne/hors ligne, adresse du webhook.
- **Journal** : les échanges réels avec Telegram.
- Style clair, épuré, dense mais aéré ; tout est libellé en français.

## 5. Téléchargement `.zip`

Bouton dans l'en-tête : le zip contient tous les fichiers du bot, plus un `package.json`, un
`README.md` d'installation et un petit lanceur autonome pour l'héberger ailleurs si tu veux.

## Détails techniques

- **Streaming** : route serveur qui appelle OpenRouter en SSE (`stream: true`, on ignore les
  lignes `: OPENROUTER PROCESSING`) et renvoie au navigateur un flux d'événements typés
  (`text`, `reasoning`, `tool`, `done`). Boucle d'agent multi-étapes avec appels d'outils
  (`read_file`, `write_file`, `delete_file`, `list_files`, `web_search`, `finish`), fallback
  automatique sur les 3 clés et les 3 modèles gratuits déjà configurés.
- **Exécution du bot** : `new Function` dans le Worker à partir des fichiers stockés, avec un
  mini résolveur de `require` interne aux fichiers du bot ; timeout et erreurs journalisées.
- **Base** : nouvelles tables `bot_files` (bot_id, path, content) et `studio_events`
  (bot_id, message_id, type, label, payload, duration_ms) ; `bot_versions` stocke désormais
  un instantané des fichiers ; RLS par utilisateur + accès service_role pour le webhook.
- **Zip** : construit côté serveur sans dépendance native (écriture ZIP « stored », pas de
  compression), renvoyé en téléchargement direct.
- La fiche de règles (`bot-spec` / `bot-engine`) et le simulateur disparaissent complètement.
