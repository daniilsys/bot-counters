<div align="center">

<h1>🔢 bot-counters</h1>

<p>Bot Discord pour afficher des compteurs dynamiques dans les noms de salons vocaux — membres, bots, boosts, rôles, et plus.</p>

<img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="discord.js v14">
<img src="https://img.shields.io/badge/node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 18+">
<img src="https://img.shields.io/badge/licence-MIT-blue?style=for-the-badge" alt="MIT">

<br><br>

</div>

---

## ✨ Fonctionnalités

- **Compteurs automatiques** — les noms de salons se mettent à jour toutes les 5 minutes
- **Anti rate-limit** — cooldown par salon + skip si le nom n'a pas changé
- **Compteurs classiques** — membres, bots, humains, en ligne, boosts, salons, vocal
- **Compteurs de rôle** — nombre de membres ayant un rôle précis
- **Panel interactif** — ajout, modification, suppression via boutons et menus
- **Persistance** — base de données JSON locale, créée automatiquement au démarrage

---

## 🚀 Installation

**1. Cloner le dépôt**

```bash
git clone https://github.com/daniilsys/bot-counters.git
cd bot-counters
```

**2. Installer les dépendances**

```bash
npm install
```

**3. Configurer l'environnement**

```bash
cp .env.example .env
```

Puis remplir le fichier `.env` :

```env
TOKEN=ton_token_discord
PREFIX=c!
```

**4. Lancer le bot**

```bash
node index.js
```

---

## ⚙️ Configuration

| Variable | Obligatoire | Description | Défaut |
|---|---|---|---|
| `TOKEN` | ✅ | Token du bot Discord | — |
| `PREFIX` | ❌ | Préfixe des commandes | `c!` |

> Le fichier `data.db` est créé automatiquement au premier démarrage.

---

## 📋 Commandes

| Commande | Alias | Description |
|---|---|---|
| `c!compteurs` | `counter`, `counters` | Ouvre le panel de gestion des compteurs |
| `c!variables` | `var`, `variable` | Affiche les variables disponibles |
| `c!help` | `h` | Affiche cette aide |

---

## 🔣 Variables

Les variables s'utilisent dans le nom du compteur, ex : `Membres : {members}`

| Variable | Description |
|---|---|
| `{members}` | Nombre total de membres |
| `{bots}` | Nombre de bots |
| `{humans}` | Nombre d'humains |
| `{online}` | Membres en ligne (online / idle / dnd) |
| `{boosts}` | Nombre de boosts du serveur |
| `{channels}` | Nombre de salons |
| `{voice}` | Membres actuellement en vocal |
| `{count}` | Membres ayant le rôle *(compteurs de rôle uniquement)* |

---

## 🗂️ Structure

```
bot-counters/
├── index.js          # Code principal
├── .env              # Token et préfixe (non versionné)
├── .env.example      # Template de configuration
├── data.db           # Base de données JSON (non versionné)
├── package.json
└── .gitignore
```

---

## 📝 Permissions Discord requises

Le bot doit avoir les permissions suivantes sur le serveur :

- `Manage Channels` — pour renommer les salons
- `View Channels` — pour accéder aux salons
- `Send Messages` + `Embed Links` — pour les commandes

Sur le **Portail Développeur**, activer les **Privileged Intents** :

- `Server Members Intent`
- `Presence Intent`
- `Message Content Intent`

---

<div align="center">
  <sub>by <a href="https://github.com/daniilsys">daniilsys</a></sub>
</div>
