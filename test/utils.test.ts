import test from 'node:test';
import assert from 'node:assert/strict';
import { isYoungerThanDays, safeChannelName, welcomeText } from '../src/utils.js';

test('identifica contas com menos de 30 dias', () => {
  const now = Date.UTC(2026, 0, 31);
  assert.equal(isYoungerThanDays(now - 29 * 86400000, 30, now), true);
  assert.equal(isYoungerThanDays(now - 30 * 86400000, 30, now), false);
});

test('sanitiza nomes de tickets', () => {
  assert.equal(safeChannelName('Joao Silva #42'), 'joao-silva-42');
  assert.equal(safeChannelName('!!!'), 'usuario');
});

test('monta a mensagem de boas-vindas com canal de verificacao', () => {
  assert.equal(welcomeText('Panda', '123'), 'Leia as regras e faça sua verificação no canal <#123>');
});
