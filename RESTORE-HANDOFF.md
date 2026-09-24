# World Genesis Bot - Handoff de Restauração

Data do backup: 2026-09-22

## Restaurar após formatar

1. Instalar Node.js LTS.
2. Copiar esta pasta para um caminho local, por exemplo `C:\Bots\Bot World Genesis`.
3. Confirmar que `.env` existe e revisar o token. Como o token apareceu em mensagens anteriores, revogá-lo no Discord Developer Portal e gerar um novo antes de usar.
4. No PowerShell, dentro da pasta do projeto, valide o projeto:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm.cmd install
npm.cmd run build
npm.cmd test
```

Para a produção, faça o primeiro upload com a CLI da Discloud (`discloud login` e `npm run deploy:cloud`) ou configure os segredos `DISCLOUD_API_TOKEN` e `DISCLOUD_APP_ID` no GitHub e faça push na branch `main`. O workflow fará os próximos deploys automaticamente.

## Hospedagem

O bot não inicia mais junto com o Windows. A produção roda na Discloud, configurada por `discloud.config`.

O workflow `.github/workflows/deploy-discloud.yml` faz deploy automático a cada push na branch `main`, depois de executar build e testes. Configure os segredos `DISCLOUD_API_TOKEN` e `DISCLOUD_APP_ID` no repositório GitHub.

## Configuração preservada

O `.env` contém os IDs do servidor, canais, categoria de tickets, canal de transcrições, sugestões, salas de voz e cargos de suporte. O arquivo `data/state.json` contém IDs das mensagens persistentes, convite e contador de sugestões.

Não publicar o `.env` nem enviar seu conteúdo para terceiros.

## Recursos implementados

- Termos e regras em Components V2.
- Verificação e cargo verificado.
- Boas-vindas com expulsão de contas com menos de 30 dias.
- Tickets privados, botão de fechamento por cargo e transcrição.
- Mensagens `Em breve...` em dois canais.
- Sugestões em Components V2, confirmação de 10 segundos, contador persistente e tópico vazio.
- Salas de voz temporárias na categoria configurada, com senha opcional e cargos liberados.
- Tratamento de interações expiradas sem derrubar o processo.

## Retomar o chat

Depois da formatação, instalar Node.js, Git, o VS Code e as extensões GitHub Copilot/Copilot Chat, entrar na mesma conta Microsoft/GitHub e abrir esta conversa pelo histórico do Copilot. Se o histórico não aparecer, abrir este arquivo e enviar ao Copilot:

> Continue o trabalho do projeto World Genesis Bot a partir do RESTORE-HANDOFF.md. Leia o projeto inteiro antes de editar, preserve o .env, compile, teste e reinicie o bot após qualquer alteração.

## Limitações conhecidas

- O Discord não abre modal diretamente no evento de entrada em canal de voz; o bot usa DM com botão para abrir a caixa de senha.
- O atalho de inicialização é específico do Windows e precisa ser recriado após a formatação.
- O histórico do chat depende da sincronização da conta do Copilot; este handoff é a alternativa local.
