import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

export const config = {
  token: required('DISCORD_TOKEN'),
  guildId: required('GUILD_ID'),
  verifiedRoleId: process.env.VERIFIED_ROLE_ID?.trim() ?? '',
  supportRoleIds: list(process.env.SUPPORT_ROLE_IDS),
  minAccountAgeDays: Number.parseInt(process.env.MIN_ACCOUNT_AGE_DAYS ?? '30', 10),
  stateFile: process.env.STATE_FILE?.trim() || 'data/state.json',
  channels: {
    terms: process.env.TERMS_CHANNEL_ID ?? '1545972663086747759',
    welcome: process.env.WELCOME_CHANNEL_ID ?? '1545972601141338112',
    verification: process.env.VERIFICATION_CHANNEL_ID ?? '1545972718980304906',
    invite: process.env.INVITE_CHANNEL_ID ?? '1545973781967671366',
    ticketPanel: process.env.TICKET_PANEL_CHANNEL_ID ?? '1545975152590721076',
    ticketCategory: process.env.TICKET_CATEGORY_ID ?? '1545985558722125894',
    transcript: process.env.TRANSCRIPT_CHANNEL_ID ?? '1545992567315759144',
    soonOne: process.env.SOON_CHANNEL_ONE_ID ?? '1545973644268675122',
    soonTwo: process.env.SOON_CHANNEL_TWO_ID ?? '1545976132262825984',
    suggestions: process.env.SUGGESTIONS_CHANNEL_ID ?? '1545974945023135794',
    voiceLobby: process.env.VOICE_LOBBY_CHANNEL_ID ?? '1545975743048060969',
    voiceCategory: process.env.VOICE_CATEGORY_ID ?? '1546184058168414329'
  },
  voiceBypassRoleIds: list(process.env.VOICE_BYPASS_ROLE_IDS ?? '1545986456932188281,1545986566235750470,1545986595675578468,1545986619465801828')
};

if (!Number.isFinite(config.minAccountAgeDays) || config.minAccountAgeDays < 0) {
  throw new Error('MIN_ACCOUNT_AGE_DAYS precisa ser um numero positivo.');
}
