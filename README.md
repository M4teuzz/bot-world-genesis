# World Genesis Discord Bot

Bot em TypeScript para:

- publicar Termos de Uso em Components V2 com botao `Regras`;
- verificar membros por botao e atribuir um cargo configurado;
- expulsar contas com menos de 30 dias;
- publicar boas-vindas e manter um convite permanente;
- abrir tickets privados com modal de assunto.

## Configuracao

1. Instale Node.js 20 ou superior.
2. Copie `.env.example` para `.env`.
3. Preencha `DISCORD_TOKEN`, `GUILD_ID` e `VERIFIED_ROLE_ID`.
4. Convide o bot com os escopos `bot` e `applications.commands` e as permissoes de gerenciar canais, expulsar membros, gerenciar cargos, criar convites e enviar mensagens.
5. Rode `npm install`, `npm run build` e `npm start`.

O bot precisa do **Server Members Intent** habilitado no Developer Portal para tratar novas entradas. O arquivo `data/state.json` e criado automaticamente e guarda somente IDs de mensagens/canais e o convite persistente, nunca o token.

O cargo verificado precisa estar abaixo do cargo mais alto do bot na hierarquia do servidor. Para tickets, preencha `SUPPORT_ROLE_IDS` quando souber quais cargos terao acesso.

## Deploy na Discloud

O arquivo `discloud.config` configura o build e a inicializacao do bot na Discloud. O token do Discord e as demais variaveis do `.env` devem ser cadastrados como variaveis de ambiente no painel da Discloud; nao envie `.env` para o repositorio.

Para o primeiro deploy local, instale a CLI e execute `discloud login` com o token da API da Discloud. Depois, use `npm run deploy:cloud`.

O workflow `.github/workflows/deploy-discloud.yml` publica automaticamente cada push na branch `main`, mas somente depois de build e testes passarem. No repositorio GitHub, cadastre os segredos `DISCLOUD_API_TOKEN` e `DISCLOUD_APP_ID`. O `DISCLOUD_APP_ID` e o ID da aplicacao criado no primeiro upload.

O bot nao e mais iniciado pelo Windows. A execucao de producao ocorre na Discloud.

### Sincronizacao automatica ao salvar

Depois de instalar o Git for Windows e autenticar o GitHub, execute `npm run sync:github` em uma janela separada. O script monitora os arquivos do projeto, espera tres segundos depois do ultimo salvamento e faz commit/push automaticamente na branch `main`.

O GitHub Actions executa build e testes e envia o codigo atualizado para a Discloud. Ele nao reinicia o bot automaticamente; reinicie a aplicacao no painel da Discloud somente quando a alteracao exigir reinicio. `.env`, `data`, `dist` e `node_modules` permanecem fora do envio.
