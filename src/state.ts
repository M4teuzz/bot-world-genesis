import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type BotState = {
  messages: Partial<Record<'terms' | 'verification' | 'ticketPanel' | 'invite' | 'soonOne' | 'soonTwo', string>>;
  inviteCode?: string;
  suggestionCounter?: number;
};

const emptyState = (): BotState => ({ messages: {} });

export async function loadState(file: string): Promise<BotState> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<BotState>;
    return { messages: parsed.messages ?? {}, inviteCode: parsed.inviteCode, suggestionCounter: parsed.suggestionCounter ?? 0 };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') console.warn(`[state] Nao foi possivel ler ${file}:`, error);
    return emptyState();
  }
}

export async function saveState(file: string, state: BotState): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
