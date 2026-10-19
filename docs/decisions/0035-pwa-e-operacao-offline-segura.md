# ADR 0035 — PWA e operação offline segura

**Estado:** aceito e implementado em 28 de agosto de 2026.

## Contexto

A cozinha pode perder conexão durante o trabalho. Enfileirar silenciosamente alterações de estoque, produção ou dinheiro no navegador criaria a falsa impressão de salvamento e conflitos difíceis de reconciliar.

## Decisão

- A aplicação possui manifesto instalável e service worker versionado.
- Navegações visitadas e recursos estáticos essenciais são preservados em cache; uma página própria orienta quando não houver conteúdo disponível.
- Um aviso fixo e acessível comunica a perda de conexão.
- Enquanto offline, a experiência é deliberadamente de consulta: a interface orienta esperar a conexão para salvar.
- Comandos de negócio continuam protegidos por idempotência no servidor; nenhuma escrita crítica é confirmada apenas no dispositivo.

## Consequências

A proprietária não perde imediatamente a referência que já abriu e não recebe uma promessa enganosa de sincronização. Uma fila offline de escrita só será adicionada se cada comando ganhar política explícita de conflito, validade e reconciliação.
