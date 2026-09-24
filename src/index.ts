import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextChannel,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder
} from 'discord.js';
import { config } from './config.js';
import { loadState, saveState, type BotState } from './state.js';
import { isYoungerThanDays, safeChannelName, welcomeText } from './utils.js';
import { RULES_TEXT } from './rules.js';
import { ensureSoonMessages, SuggestionButtons, SuggestionManager, VoiceRoomManager } from './community-features.js';

const client = new Client({ intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent', 'GuildVoiceStates', 'DirectMessages'] });
let state: BotState;
let suggestionManager: SuggestionManager;
const voiceRoomManager = new VoiceRoomManager();

function button(customId: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function termsComponents() {
  return [new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Termos de Uso e Regras\nPara confirmar que está ciente dos Termos de Uso e Regras, clique no botão abaixo.'))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button('rules:show', 'Regras', ButtonStyle.Secondary).setEmoji('✅')))];
}

function verificationComponents() {
  return [new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Para ter acesso ao restante do Discord, clique em:'))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button('member:verify', 'Verificar-se', ButtonStyle.Success)))];
}

function ticketComponents() {
  return [new ContainerBuilder()
    .setAccentColor(0x3498db)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Se precisar de ajuda, basta abrir um ticket e informar o assunto.'))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button('ticket:open', 'Abrir ticket', ButtonStyle.Primary)))];
}

function ticketMessageComponents() {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    button('ticket:close', 'Fechar Ticket', ButtonStyle.Danger)
  )];
}

async function textChannel(guild: Guild, id: string, label: string): Promise<TextChannel> {
  const channel = await guild.channels.fetch(id);
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error(`${label} ${id} não é um canal de texto acessível.`);
  return channel;
}

async function existingMessage(channel: TextChannel, id: string | undefined): Promise<Message | undefined> {
  if (!id) return undefined;
  try { return await channel.messages.fetch(id); } catch { return undefined; }
}

async function ensurePersistentMessage(
  guild: Guild,
  key: 'terms' | 'verification' | 'ticketPanel',
  channelId: string,
  payload: Parameters<TextChannel['send']>[0]
): Promise<void> {
  const channel = await textChannel(guild, channelId, `Canal ${key}`);
  const current = await existingMessage(channel, state.messages[key]);
  if (current) return;
  const sent = await channel.send(payload);
  state.messages[key] = sent.id;
  await saveState(config.stateFile, state);
  console.log(`[setup] mensagem ${key} criada: ${sent.id}`);
}

async function ensureInvite(guild: Guild): Promise<void> {
  const channel = await textChannel(guild, config.channels.invite, 'Canal de convite');
  let invite = state.inviteCode ? await guild.invites.fetch(state.inviteCode).catch(() => undefined) : undefined;
  if (!invite) {
    invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: 'Convite permanente do World Genesis' });
    state.inviteCode = invite.code;
    await saveState(config.stateFile, state);
    console.log(`[setup] convite permanente criado: ${invite.code}`);
  }
  const currentMessage = await existingMessage(channel, state.messages.invite);
  if (!currentMessage) {
    const sent = await channel.send(`Convite permanente do servidor:\nhttps://discord.gg/${invite.code}`);
    state.messages.invite = sent.id;
    await saveState(config.stateFile, state);
  }
}

async function removeLegacyWelcomeMessages(guild: Guild): Promise<void> {
  const channel = await textChannel(guild, config.channels.welcome, 'Canal de boas-vindas');
  const messages = await channel.messages.fetch({ limit: 100 });
  const legacyMessages = messages.filter((message) => {
    if (message.author.id !== client.user?.id) return false;
    const embed = message.embeds[0];
    return Boolean(embed?.title?.startsWith('Bem-vindo') && embed.description?.startsWith('Bem-vindo'));
  });
  if (legacyMessages.size) {
    await channel.bulkDelete(legacyMessages, true).catch(() => undefined);
    console.log(`[setup] mensagens antigas de boas-vindas removidas: ${legacyMessages.size}`);
  }
}

async function setupGuild(guild: Guild): Promise<void> {
  if (guild.id !== config.guildId) return;
  await removeLegacyWelcomeMessages(guild);
  await validateSuggestionPermissions(guild);
  await ensurePersistentMessage(guild, 'terms', config.channels.terms, {
    components: termsComponents(), flags: MessageFlags.IsComponentsV2
  });
  await ensurePersistentMessage(guild, 'verification', config.channels.verification, {
    components: verificationComponents(), flags: MessageFlags.IsComponentsV2
  });
  await ensurePersistentMessage(guild, 'ticketPanel', config.channels.ticketPanel, {
    components: ticketComponents(), flags: MessageFlags.IsComponentsV2
  });
  await ensureInvite(guild);
  await ensureSoonMessages(guild, state, config.stateFile);
}

async function validateSuggestionPermissions(guild: Guild): Promise<void> {
  const channel = await guild.channels.fetch(config.channels.suggestions);
  const me = guild.members.me ?? await guild.members.fetch(client.user!.id);
  if (!channel || !channel.isTextBased()) {
    console.warn('[sugestoes] o canal configurado nao e um canal de texto.');
    return;
  }
  const permissions = channel.permissionsFor(me);
  const required = [
    ['Ver canal', PermissionFlagsBits.ViewChannel],
    ['Enviar mensagens', PermissionFlagsBits.SendMessages],
    ['Ler histórico', PermissionFlagsBits.ReadMessageHistory],
    ['Gerenciar mensagens', PermissionFlagsBits.ManageMessages],
    ['Criar tópicos públicos', PermissionFlagsBits.CreatePublicThreads],
    ['Adicionar reações', PermissionFlagsBits.AddReactions]
  ] as const;
  const missing = required.filter(([, permission]) => !permissions?.has(permission)).map(([name]) => name);
  if (missing.length) console.warn(`[sugestoes] permissões ausentes: ${missing.join(', ')}.`);
}

async function sendRuleChunks(interaction: import('discord.js').ButtonInteraction): Promise<void> {
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of RULES_TEXT.split('\n\n')) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= 1900) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = paragraph;
  }
  if (current) chunks.push(current);
  await interaction.reply({ content: chunks[0] ?? 'As regras não estão disponíveis.', flags: MessageFlags.Ephemeral });
  for (const chunk of chunks.slice(1)) await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
}

async function handleVerification(interaction: import('discord.js').ButtonInteraction): Promise<void> {
  if (!interaction.inGuild() || !config.verifiedRoleId) {
    await interaction.reply({ content: 'A verificação ainda não foi configurada pela administração.', flags: MessageFlags.Ephemeral });
    return;
  }
  const guild = interaction.guild;
  if (!guild) return;
  const member = await guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(config.verifiedRoleId)) {
    await interaction.reply({ content: 'Você já está verificado.', flags: MessageFlags.Ephemeral });
    return;
  }
  await member.roles.add(config.verifiedRoleId, 'Verificação pelo bot World Genesis');
  await interaction.reply({ content: 'Verificação concluída. Bem-vindo!', flags: MessageFlags.Ephemeral });
}

async function handleTicket(interaction: import('discord.js').ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder().setCustomId('ticket:modal').setTitle('Abrir ticket');
  const subject = new TextInputBuilder().setCustomId('ticket:subject').setLabel('Qual o assunto do ticket?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(subject));
  await interaction.showModal(modal);
}

async function createTicket(interaction: import('discord.js').ModalSubmitInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guild = interaction.guild;
  if (!guild) return;
  const category = await guild.channels.fetch(config.channels.ticketCategory);
  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.reply({ content: 'A categoria de tickets não foi encontrada.', flags: MessageFlags.Ephemeral });
    return;
  }
  const subject = interaction.fields.getTextInputValue('ticket:subject');
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ...config.supportRoleIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))
  ];
  const channel = await guild.channels.create({
    name: safeChannelName(subject),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    topic: `Assunto: ${subject.slice(0, 900)}`
  });
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`Ticket de ${interaction.user.displayName}`)
    .setDescription(`**Assunto:** ${subject}`)
    .setFooter({ text: 'Apenas a equipe autorizada pode fechar este ticket.' });
  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: ticketMessageComponents() });
  await interaction.reply({ content: `Seu ticket foi criado em <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
}

async function closeTicket(interaction: import('discord.js').ButtonInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;
  const guild = interaction.guild;
  if (!guild) return;
  const member = await guild.members.fetch(interaction.user.id);
  const canClose = config.supportRoleIds.some((roleId) => member.roles.cache.has(roleId));
  if (!canClose) {
    await interaction.reply({ content: 'Apenas a equipe de suporte pode fechar este ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticketChannel = interaction.channel;
  const transcriptChannel = await textChannel(guild, config.channels.transcript, 'Canal de transcrições');
  const messages = await ticketChannel.messages.fetch({ limit: 100 });
  const lines = [...messages.values()]
    .sort((first, second) => first.createdTimestamp - second.createdTimestamp)
    .map((message) => {
      const content = message.cleanContent || '[sem texto]';
      const attachments = [...message.attachments.values()].map((attachment) => attachment.url).join(', ');
      return `[${message.createdAt.toLocaleString('pt-BR')}] ${message.author.tag}: ${content}${attachments ? ` | Anexos: ${attachments}` : ''}`;
    });
  const transcriptChunks: string[] = [];
  let currentChunk = '';
  for (const line of lines) {
    const candidate = currentChunk ? `${currentChunk}\n${line}` : line;
    if (candidate.length <= 1900) {
      currentChunk = candidate;
    } else {
      if (currentChunk) transcriptChunks.push(currentChunk);
      currentChunk = line.slice(0, 1900);
    }
  }
  if (currentChunk) transcriptChunks.push(currentChunk);
  await transcriptChannel.send({
    embeds: [new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`Transcrição: ${ticketChannel.name}`)
      .setDescription(`Fechado por <@${interaction.user.id}>\nMensagens registradas: ${lines.length}`)
      .setTimestamp()]
  });
  for (const chunk of transcriptChunks) {
    await transcriptChannel.send({ content: chunk, allowedMentions: { parse: [] } });
  }
  await interaction.reply({ content: 'Ticket fechado e transcrição enviada.', flags: MessageFlags.Ephemeral });
  await ticketChannel.delete(`Ticket fechado por ${interaction.user.tag}`);
}

async function welcomeMember(member: GuildMember): Promise<void> {
  if (member.guild.id !== config.guildId || member.user.bot) return;
  const channel = await textChannel(member.guild, config.channels.welcome, 'Canal de boas-vindas');
  const isNew = isYoungerThanDays(member.user.createdTimestamp, config.minAccountAgeDays);
  const embed = new EmbedBuilder().setColor(0x2ecc71).setTitle(`Bem-vindo, ${member.displayName}!`).setDescription(welcomeText(member.displayName, config.channels.verification)).setThumbnail(member.user.displayAvatarURL());
  if (isNew) embed.setFooter({ text: `Conta com menos de ${config.minAccountAgeDays} dias: expulsão automática.` });
  await channel.send({ embeds: [embed] });
  if (isNew && member.kickable) await member.kick(`Conta com menos de ${config.minAccountAgeDays} dias`);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[ready] conectado como ${readyClient.user.tag}`);
  state = await loadState(config.stateFile);
  suggestionManager = new SuggestionManager(state, config.stateFile);
  try { await setupGuild(await readyClient.guilds.fetch(config.guildId)); }
  catch (error) { console.error('[setup] falha nao fatal:', error); }
});

client.on(Events.GuildMemberAdd, (member) => { void welcomeMember(member).catch((error) => console.error('[welcome] falha:', error)); });
client.on(Events.MessageCreate, (message) => { void suggestionManager?.handleMessage(message).catch((error) => console.error('[suggestions] falha:', error)); });
client.on(Events.VoiceStateUpdate, (oldState, newState) => { void voiceRoomManager.handleState(oldState, newState).catch((error) => console.error('[voice] falha:', error)); });
client.on(Events.InteractionCreate, (interaction) => {
  void (async () => {
    if (interaction.isButton() && suggestionManager && SuggestionButtons.isSuggestion(interaction.customId)) {
      await suggestionManager.handleButton(interaction);
      return;
    }
    if (interaction.isButton() && await voiceRoomManager.handleButton(interaction)) return;
    if (interaction.isModalSubmit() && await voiceRoomManager.handleModal(interaction)) return;
    if (interaction.isButton()) {
      if (interaction.customId === 'rules:show') return sendRuleChunks(interaction);
      if (interaction.customId === 'member:verify') return handleVerification(interaction);
      if (interaction.customId === 'ticket:open') return handleTicket(interaction);
      if (interaction.customId === 'ticket:close') return closeTicket(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'ticket:modal') return createTicket(interaction);
  })().catch((error) => {
    const discordCode = (error as { code?: number }).code;
    if (discordCode === 10062 || discordCode === 40060) {
      console.warn('[interaction] interacao expirada ou ja respondida; ignorando.');
      return;
    }
    console.error('[interaction] falha:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) void interaction.reply({ content: 'Nao foi possivel concluir a operacao.', flags: MessageFlags.Ephemeral });
  });
});

process.on('SIGINT', () => { client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
void client.login(config.token);
