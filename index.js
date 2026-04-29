require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
  } = require("discord.js"),
  { readFileSync, writeFileSync, existsSync } = require("fs");

const token = process.env.TOKEN;
const prefix = process.env.PREFIX ?? "c!";

if (!token) {
  console.error("TOKEN manquant dans le fichier .env");
  process.exit(1);
}

const DB_PATH = "./data.db";
if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, "{}");
let database = JSON.parse(readFileSync(DB_PATH));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// Per-channel cooldown: last update time + last set name
const channelCache = new Map();
const CHANNEL_COOLDOWN = 5 * 60 * 1000; // Discord allows ~2 renames/10min per channel

client.login(token).catch((err) => {
  console.error("Impossible de se connecter à Discord :", err.message);
  process.exit(1);
});

client.on("error", (err) =>
  console.error("Erreur client Discord :", err.message),
);

process.on("unhandledRejection", (err) =>
  console.error("Rejet non géré :", err),
);

function writeDatabase() {
  try {
    writeFileSync(DB_PATH, JSON.stringify(database, null, 2));
  } catch (err) {
    console.error("Erreur écriture base de données :", err.message);
  }
}

async function replace(str, guild, isRole, roleId) {
  const members = await guild.members.fetch();
  if (isRole) {
    const role = guild.roles.cache.get(roleId);
    if (!role) return str;
    return str.replace(
      "{count}",
      members.filter((m) => m.roles.cache.has(role.id)).size.toString(),
    );
  }
  return str
    .replace("{members}", guild.memberCount.toString())
    .replace("{bots}", members.filter((m) => m.user.bot).size.toString())
    .replace("{humans}", members.filter((m) => !m.user.bot).size.toString())
    .replace(
      "{online}",
      members
        .filter((m) => ["idle", "dnd", "online"].includes(m.presence?.status))
        .size.toString(),
    )
    .replace("{boosts}", (guild.premiumSubscriptionCount ?? 0).toString())
    .replace("{channels}", guild.channels.cache.size.toString())
    .replace("{voice}", guild.voiceStates.cache.size.toString());
}

async function updateCounters() {
  const guilds = database.guilds || {};
  for (const guildId in guilds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    for (const counterData of guilds[guildId]) {
      try {
        const channel = guild.channels.cache.get(counterData.id);
        if (!channel) continue;

        const now = Date.now();
        const cached = channelCache.get(counterData.id);
        if (cached && now - cached.lastUpdate < CHANNEL_COOLDOWN) continue;

        const newName = await replace(
          counterData.name,
          guild,
          counterData.type === "role",
          counterData.roleId,
        );
        if (cached && cached.name === newName) continue;

        await channel.setName(newName);
        channelCache.set(counterData.id, { name: newName, lastUpdate: now });
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        console.error(`Erreur compteur ${counterData.id}:`, err.message);
      }
    }
  }
}

client.on("clientReady", () => {
  console.log(`Bot compteur connecté en tant que ${client.user.tag} !`);
  updateCounters();
  setInterval(updateCounters, 5 * 60 * 1000);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  if (!database.guilds) database.guilds = {};
  const guildData = (database.guilds[message.guild.id] ??= []);

  // ── Compteurs ─────────────────────────────────────────────────────────────
  if (["counters", "counter", "compteurs"].includes(command)) {
    const msg = await message.channel
      .send({ embeds: [buildEmbed()], components: [buildRow()] })
      .catch(() => null);
    if (!msg) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => {
        if (i.user.id !== message.author.id) {
          i.reply({
            content: "Vous n'avez pas la permission de faire cela !",
            ephemeral: true,
          }).catch(() => {});
          return false;
        }
        return true;
      },
      time: 120000,
    });

    collector.on("end", () => msg.edit({ components: [] }).catch(() => {}));

    collector.on("collect", async (interaction) => {
      const { customId } = interaction;

      // ── Ajouter ──────────────────────────────────────────────────────
      if (customId === "add") {
        const typeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("classic")
            .setLabel("Compteur Classique")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("role")
            .setLabel("Compteur de Rôle")
            .setStyle(ButtonStyle.Secondary),
        );
        const reply = await interaction
          .reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Quel est le type de compteur ?")
                .setColor("Aqua"),
            ],
            components: [typeRow],
            fetchReply: true,
          })
          .catch(() => null);
        if (!reply) return;

        const typeInt = await reply
          .awaitMessageComponent({
            componentType: ComponentType.Button,
            time: 30000,
            filter: (i) => i.user.id === message.author.id,
          })
          .catch(() => null);
        if (!typeInt) return reply.delete().catch(() => {});
        await typeInt.deferUpdate().catch(() => {});
        const type = typeInt.customId;

        let role;
        if (type === "role") {
          await reply
            .edit({
              embeds: [],
              components: [
                new ActionRowBuilder().addComponents(
                  new RoleSelectMenuBuilder()
                    .setCustomId("role-selector")
                    .setPlaceholder("Sélectionnez un rôle"),
                ),
              ],
            })
            .catch(() => {});
          const roleInt = await reply
            .awaitMessageComponent({
              componentType: ComponentType.RoleSelect,
              time: 30000,
              filter: (i) => i.user.id === message.author.id,
            })
            .catch(() => null);
          if (!roleInt) return reply.delete().catch(() => {});
          role = roleInt.roles.first();
          await roleInt.deferUpdate().catch(() => {});
        }

        await reply
          .edit({
            embeds: [],
            components: [
              new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                  .setCustomId("channel-selector")
                  .setPlaceholder("Sélectionnez un salon"),
              ),
            ],
          })
          .catch(() => {});

        const channelInt = await reply
          .awaitMessageComponent({
            componentType: ComponentType.ChannelSelect,
            time: 30000,
            filter: (i) => i.user.id === message.author.id,
          })
          .catch(() => null);
        if (!channelInt) return reply.delete().catch(() => {});

        const channel = channelInt.channels.first();
        if (!channel) return reply.delete().catch(() => {});

        const modal = new ModalBuilder()
          .setCustomId("counter-name-modal")
          .setTitle("Nom du compteur")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("counter-name")
                .setLabel(channel.name)
                .setPlaceholder("Ex: Membres: {members}")
                .setMinLength(1)
                .setMaxLength(100)
                .setRequired(true)
                .setStyle(TextInputStyle.Short),
            ),
          );

        await channelInt.showModal(modal).catch(() => {});
        const submit = await channelInt
          .awaitModalSubmit({ time: 60000 })
          .catch(() => null);
        if (!submit) return reply.delete().catch(() => {});
        await submit.deferUpdate().catch(() => {});

        const name = submit.fields.getTextInputValue("counter-name");
        if (!name) return;

        const data = { name, id: channel.id };
        if (type === "role") {
          data.type = "role";
          data.roleId = role.id;
        }

        guildData.push(data);
        writeDatabase();
        await Promise.all([
          msg
            .edit({ embeds: [buildEmbed()], components: [buildRow()] })
            .catch(() => {}),
          reply.delete().catch(() => {}),
        ]);

        // ── Modifier ─────────────────────────────────────────────────────
      } else if (customId === "edit") {
        if (guildData.length === 0)
          return interaction
            .reply({ content: "Aucun compteur à modifier.", ephemeral: true })
            .catch(() => {});

        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("edit-selector")
            .setPlaceholder("Sélectionnez un compteur à modifier")
            .addOptions(
              guildData.map((c, i) => ({
                label: c.name.slice(0, 100),
                value: i.toString(),
                description: `${c.type === "role" ? "Rôle" : "Classique"} — salon ${c.id}`,
              })),
            ),
        );

        const reply = await interaction
          .reply({ components: [selectRow], fetchReply: true })
          .catch(() => null);
        if (!reply) return;

        const selectInt = await reply
          .awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 30000,
            filter: (i) => i.user.id === message.author.id,
          })
          .catch(() => null);
        if (!selectInt) return reply.delete().catch(() => {});

        const idx = parseInt(selectInt.values[0]);
        const counter = guildData[idx];

        const modal = new ModalBuilder()
          .setCustomId("edit-name-modal")
          .setTitle("Modifier le compteur")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("counter-name")
                .setLabel("Nouveau nom / modèle")
                .setValue(counter.name)
                .setMinLength(1)
                .setMaxLength(100)
                .setRequired(true)
                .setStyle(TextInputStyle.Short),
            ),
          );

        await selectInt.showModal(modal).catch(() => {});
        const submit = await selectInt
          .awaitModalSubmit({ time: 60000 })
          .catch(() => null);
        if (!submit) return reply.delete().catch(() => {});
        await submit.deferUpdate().catch(() => {});

        const newName = submit.fields.getTextInputValue("counter-name");
        if (!newName) return;

        guildData[idx].name = newName;
        channelCache.delete(counter.id);
        writeDatabase();
        await Promise.all([
          msg
            .edit({ embeds: [buildEmbed()], components: [buildRow()] })
            .catch(() => {}),
          reply.delete().catch(() => {}),
        ]);

        // ── Supprimer ────────────────────────────────────────────────────
      } else if (customId === "remove") {
        if (guildData.length === 0)
          return interaction
            .reply({ content: "Aucun compteur à supprimer.", ephemeral: true })
            .catch(() => {});

        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("counter-selector")
            .setPlaceholder("Sélectionnez un/plusieurs compteur(s)")
            .setMinValues(1)
            .setMaxValues(guildData.length)
            .addOptions(
              guildData.map((c, i) => ({
                label: c.name.slice(0, 100),
                value: i.toString(),
                description: `Type: ${c.type === "role" ? "Rôle" : "Classique"}`,
              })),
            ),
        );

        const reply = await interaction
          .reply({ components: [selectRow], fetchReply: true })
          .catch(() => null);
        if (!reply) return;

        const r = await reply
          .awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 30000,
            filter: (i) => i.user.id === message.author.id,
          })
          .catch(() => null);
        if (!r) return reply.delete().catch(() => {});
        await r.deferUpdate().catch(() => {});

        // Sort descending to avoid index shifting when splicing
        r.values
          .map(Number)
          .sort((a, b) => b - a)
          .forEach((i) => guildData.splice(i, 1));
        writeDatabase();
        await Promise.all([
          msg
            .edit({ embeds: [buildEmbed()], components: [buildRow()] })
            .catch(() => {}),
          reply.delete().catch(() => {}),
        ]);

        // ── Réinitialiser ────────────────────────────────────────────────
      } else if (customId === "reset") {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("cancel")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger),
        );
        const confirmEmbed = new EmbedBuilder()
          .setDescription(
            "Vous allez réinitialiser tous les compteurs de ce serveur, êtes-vous sûr ?",
          )
          .setColor("Red");

        const reply = await interaction
          .reply({
            embeds: [confirmEmbed],
            components: [confirmRow],
            fetchReply: true,
          })
          .catch(() => null);
        if (!reply) return;

        const r = await reply
          .awaitMessageComponent({
            componentType: ComponentType.Button,
            time: 30000,
            filter: (i) => i.user.id === message.author.id,
          })
          .catch(() => null);
        if (!r) return reply.delete().catch(() => {});
        await r.deferUpdate().catch(() => {});

        if (r.customId === "confirm") {
          guildData.length = 0;
          writeDatabase();
          msg
            .edit({ embeds: [buildEmbed()], components: [buildRow()] })
            .catch(() => {});
        }
        reply.delete().catch(() => {});
      }
    });

    function buildRow() {
      const hasCounters = guildData.length > 0;
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("add")
          .setEmoji("➕")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("edit")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!hasCounters),
        new ButtonBuilder()
          .setCustomId("remove")
          .setEmoji("➖")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!hasCounters),
        new ButtonBuilder()
          .setCustomId("reset")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Secondary),
      );
    }

    function buildEmbed() {
      const lines = guildData.map(
        (c) =>
          `<${c.type === "role" ? "@&" : "#"}${c.type === "role" ? c.roleId : c.id}>${c.type === "role" ? ` — <#${c.id}>` : ""}: \`${c.name}\``,
      );
      return new EmbedBuilder()
        .setTitle("Compteurs")
        .setDescription(
          `Voici les compteurs disponibles sur ce serveur :\n${lines.join("\n") || "Aucun"}`,
        )
        .setColor("Aqua")
        .setFooter({
          text: "Utilisez la commande variables pour voir les variables disponibles.",
        });
    }

    // ── Variables ──────────────────────────────────────────────────────────────
  } else if (["var", "variable", "variables"].includes(command)) {
    message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Variables")
            .setDescription(
              "Voici les variables disponibles pour les compteurs :",
            )
            .setColor("Aqua")
            .addFields(
              {
                name: "{members}",
                value: "Nombre de membres sur le serveur",
                inline: true,
              },
              {
                name: "{bots}",
                value: "Nombre de bots sur le serveur",
                inline: true,
              },
              {
                name: "{humans}",
                value: "Nombre d'humains sur le serveur",
                inline: true,
              },
              {
                name: "{online}",
                value: "Nombre de membres en ligne",
                inline: true,
              },
              {
                name: "{boosts}",
                value: "Nombre de boosts sur le serveur",
                inline: true,
              },
              {
                name: "{channels}",
                value: "Nombre de salons sur le serveur",
                inline: true,
              },
              {
                name: "{voice}",
                value: "Nombre de membres en vocal",
                inline: true,
              },
              {
                name: "{count}",
                value: "Compteurs de rôle uniquement — membres ayant le rôle",
                inline: true,
              },
            ),
        ],
      })
      .catch(() => {});

    // ── Help ───────────────────────────────────────────────────────────────────
  } else if (["help", "h"].includes(command)) {
    message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Help")
            .setDescription("Voici les commandes disponibles :")
            .setColor("Aqua")
            .addFields(
              {
                name: `\`${prefix}compteurs\``,
                value: `Gérer les compteurs du serveur\nAlias: \`${prefix}counters\``,
              },
              {
                name: `\`${prefix}variables\``,
                value: `Variables disponibles pour les compteurs\nAlias: \`${prefix}var\``,
              },
              {
                name: `\`${prefix}help\``,
                value: `Cette aide\nAlias: \`${prefix}h\``,
              },
            )
            .setFooter({ text: "daniilsys" }),
        ],
      })
      .catch(() => {});
  }
});
