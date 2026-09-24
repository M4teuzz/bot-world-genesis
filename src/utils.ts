export function isYoungerThanDays(createdAt: number, days: number, now = Date.now()): boolean {
  return now - createdAt < days * 24 * 60 * 60 * 1000;
}

export function safeChannelName(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const result = normalized.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return result.slice(0, 70) || 'usuario';
}

export function welcomeText(displayName: string, verificationChannelId: string): string {
  return `Leia as regras e faça sua verificação no canal <#${verificationChannelId}>`;
}
