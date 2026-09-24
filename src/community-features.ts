import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  EmbedBuilder,
  Guild,
  Message,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SectionBuilder,
  TextChannel,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
  User,
  VoiceChannel,
  VoiceState
} from 'discord.js';
import { config } from './config.js';
import { saveState, type BotState } from './state.js';
import { safeChannelName } from './utils.js';

type SuggestionDraft = {
  authorId: string;
  channelId: string;
  messageId: string;
  content: string;
  attachments: string[];
};

type VoiceRoom = {
  channel: VoiceChannel;
  ownerId: string;
  password?: string;
};

function v2Text(content: string, accentColor?: number): ContainerBuilder {
  const container = new ContainerBuilder();
  if (accentColor !== undefined) container.setAccentColor(accentColor);
  return container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

export class SuggestionConfirmationCard {
  static components(draft: SuggestionDraft): ContainerBuilder[] {
    const preview = draft.content.length > 900 ? `${draft.content.slice(0, 897)}...` : draft.content;
    const attachmentText = draft.attachments.length ? `\n\nAnexos: ${draft.attachments.length}` : '';
    return [new ContainerBuilder()
      .setAccentColor(0xf1c40f)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Confirmar sugestão'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Autor:** <@${draft.authorId}>\n**Prévia:**\n${preview}${attachmentText}`))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`suggestion:confirm:${draft.messageId}`).setLabel('Confirmar').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`suggestion:cancel:${draft.messageId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger)
      ))];
  }
}

export class SuggestionCard {
  static components(number: number, author: User, content: string, attachments: string[]): ContainerBuilder[] {
    const attachmentText = attachments.length ? `\n\n**Anexos:**\n${attachments.join('\n')}` : '';
    const authorSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Autor:** ${author.tag}\n**ID:** ${author.id}`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(author.displayAvatarURL({ size: 128 })));
    return [new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ℹ️ Sugestão #${number}`))
      .addSectionComponents(authorSection)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${content}${attachmentText}`))];
  }
}

export class SuggestionButtons {
  static isSuggestion(customId: string): boolean {
    return customId.startsWith('suggestion:confirm:') || customId.startsWith('suggestion:cancel:');
  }
}

export class SuggestionManager {
  private readonly drafts = new Map<string, SuggestionDraft>();
  private counterLock: Promise<void> = Promise.resolve();

  constructor(private readonly state: BotState, private readonly stateFile: string) {}

  async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || message.channel.id !== config.channels.suggestions || message.channel.type !== ChannelType.GuildText) return;
    const draft: SuggestionDraft = {
      authorId: message.author.id,
      channelId: message.channel.id,
      messageId: message.id,
      content: message.content.trim() || '[sugestão sem texto]',
      attachments: [...message.attachments.values()].map((attachment) => attachment.url)
    };
    const confirmation = await message.channel.send({
      components: SuggestionConfirmationCard.components(draft),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
    this.drafts.set(confirmation.id, draft);
    setTimeout(() => {
      void confirmation.delete().catch(() => undefined);
      this.drafts.delete(confirmation.id);
    }, 10_000);
  }

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    if (!SuggestionButtons.isSuggestion(interaction.customId)) return false;
    const messageId = interaction.customId.split(':')[2];
    const draft = [...this.drafts.entries()].find(([, value]) => value.messageId === messageId);
    if (!draft) {
      await interaction.reply({ components: [v2Text('Esta confirmação expirou.', 0xe74c3c)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.user.id !== draft[1].authorId) {
      await interaction.reply({ components: [v2Text('Somente o autor da sugestão pode usar estes botões.', 0xe74c3c)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.customId.startsWith('suggestion:cancel:')) {
      this.drafts.delete(draft[0]);
      await interaction.message.delete().catch(() => undefined);
      return true;
    }
    await interaction.deferUpdate();
    await interaction.message.delete().catch(() => undefined);
    this.drafts.delete(draft[0]);
    const number = await this.nextNumber();
    const channel = await interaction.guild?.channels.fetch(draft[1].channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return true;
    await channel.messages.delete(draft[1].messageId).catch(() => undefined);
    const suggestion = await channel.send({
      components: SuggestionCard.components(number, interaction.user, draft[1].content, draft[1].attachments),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
    await suggestion.react('✅').catch(() => undefined);
    await suggestion.react('❌').catch(() => undefined);
    await suggestion.startThread({ name: `Sugestão ${number}`, autoArchiveDuration: 10080, reason: 'Discussão pública da sugestão' }).catch(() => undefined);
    return true;
  }

  private async nextNumber(): Promise<number> {
    let release!: () => void;
    const previous = this.counterLock;
    this.counterLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      this.state.suggestionCounter = (this.state.suggestionCounter ?? 0) + 1;
      await saveState(this.stateFile, this.state);
      return this.state.suggestionCounter;
    } finally {
      release();
    }
  }
}

export class VoiceRoomManager {
  private readonly rooms = new Map<string, VoiceRoom>();

  async handleState(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (newState.member?.user.bot) return;
    if (newState.channelId === config.channels.voiceLobby && oldState.channelId !== newState.channelId) {
      await this.createRoom(newState);
      return;
    }
    const room = newState.channelId ? this.rooms.get(newState.channelId) : undefined;
    if (room && newState.member) {
      if (room.password && !this.isBypass(newState.member) && newState.member.id !== room.ownerId) {
        await newState.setChannel(config.channels.voiceLobby).catch(() => undefined);
        await this.sendPasswordPrompt(newState.member.user, room.channel.id, 'Digite a senha da sala para entrar.');
      }
    }
    if (oldState.channelId && this.rooms.has(oldState.channelId)) {
      const oldRoom = this.rooms.get(oldState.channelId);
      if (oldRoom && oldRoom.channel.members.size === 0) {
        this.rooms.delete(oldState.channelId);
        await oldRoom.channel.delete('Sala de voz vazia').catch(() => undefined);
      }
    }
  }

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    if (interaction.customId.startsWith('room:setup:')) {
      const channelId = interaction.customId.split(':')[2];
      if (!channelId) return true;
      const room = this.rooms.get(channelId);
      if (!room || room.ownerId !== interaction.user.id) return true;
      const modal = new ModalBuilder().setCustomId(`room:password:${channelId}`).setTitle('Senha da sala');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('room:password-input').setLabel('Digite uma senha. (Opcional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)
      ));
      await interaction.showModal(modal);
      return true;
    }
    if (interaction.customId.startsWith('room:enter:')) {
      const channelId = interaction.customId.split(':')[2];
      if (!channelId) return true;
      const room = this.rooms.get(channelId);
      if (!room) {
        await interaction.reply({ content: 'Essa sala não está mais disponível.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const modal = new ModalBuilder().setCustomId(`room:check:${channelId}`).setTitle('Entrar na sala');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('room:password-input').setLabel('Digite a senha da sala.').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
      ));
      await interaction.showModal(modal);
      return true;
    }
    return false;
  }

  async handleModal(interaction: import('discord.js').ModalSubmitInteraction): Promise<boolean> {
    if (!interaction.customId.startsWith('room:')) return false;
    const [, action, channelId] = interaction.customId.split(':');
    if (!channelId) return true;
    const room = this.rooms.get(channelId);
    if (!room) {
      await interaction.reply({ content: 'Essa sala não está mais disponível.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const password = interaction.fields.getTextInputValue('room:password-input');
    if (action === 'password') {
      if (interaction.user.id !== room.ownerId) return true;
      room.password = password || undefined;
      await room.channel.permissionOverwrites.edit(room.channel.guild.roles.everyone, { Connect: !room.password });
      if (room.password) {
        await room.channel.permissionOverwrites.edit(room.channel.guild.members.me!, { Connect: true });
      }
      await interaction.reply({ content: room.password ? 'Senha definida com sucesso.' : 'A sala agora está sem senha.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (action === 'check') {
      const member = await room.channel.guild.members.fetch(interaction.user.id);
      if (password !== room.password && !this.isBypass(member)) {
        await interaction.reply({ content: 'Senha incorreta.', flags: MessageFlags.Ephemeral });
        return true;
      }
      await member.voice.setChannel(room.channel);
      await interaction.reply({ content: 'Você entrou na sala.', flags: MessageFlags.Ephemeral });
      return true;
    }
    return true;
  }

  private async createRoom(state: VoiceState): Promise<void> {
    const guild = state.guild;
    const category = await guild.channels.fetch(config.channels.voiceCategory);
    if (!category || category.type !== ChannelType.GuildCategory || !state.member) return;
    const channel = await guild.channels.create({
      name: safeChannelName(state.member.displayName),
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }]
    });
    this.rooms.set(channel.id, { channel, ownerId: state.member.id });
    await state.setChannel(channel);
    await this.sendSetupPrompt(state.member.user, channel.id);
  }

  private async sendSetupPrompt(user: User, channelId: string): Promise<void> {
    await user.send({ components: [v2Text('Sua sala foi criada. Você pode definir uma senha opcional.', 0x3498db), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`room:setup:${channelId}`).setLabel('Definir senha').setStyle(ButtonStyle.Primary))], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => undefined);
  }

  private async sendPasswordPrompt(user: User, channelId: string, text: string): Promise<void> {
    await user.send({ components: [v2Text(text, 0xf1c40f), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`room:enter:${channelId}`).setLabel('Digitar senha').setStyle(ButtonStyle.Primary))], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => undefined);
  }

  private isBypass(member: import('discord.js').GuildMember): boolean {
    return config.voiceBypassRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }
}

export async function ensureSoonMessages(guild: Guild, state: BotState, stateFile: string): Promise<void> {
  for (const [key, channelId] of [['soonOne', config.channels.soonOne], ['soonTwo', config.channels.soonTwo]] as const) {
    if (state.messages[key]) {
      const existing = await guild.channels.fetch(channelId).then((channel) => channel?.type === ChannelType.GuildText ? channel.messages.fetch(state.messages[key]!).catch(() => undefined) : undefined).catch(() => undefined);
      if (existing) continue;
    }
    const channel = await guild.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    const message = await channel.send({ embeds: [new EmbedBuilder().setColor(0x3498db).setDescription('Em breve...')] });
    state.messages[key] = message.id;
    await saveState(stateFile, state);
  }
}
