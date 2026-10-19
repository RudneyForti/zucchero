# ADR 0037 — Outbox transacional e worker BullMQ

**Estado:** aceito e implementado em 28 de agosto de 2026.

## Contexto

Notificações, integrações e processamentos demorados não devem ampliar a transação HTTP nem podem desaparecer quando Redis ou um consumidor estiver temporariamente indisponível. Publicar diretamente na fila antes ou depois do commit cria, respectivamente, eventos fantasmas ou fatos persistidos sem evento.

## Decisão

- Operações críticas gravam `outbox_events` na mesma transação PostgreSQL do fato de negócio.
- O primeiro conjunto cobre pedido confirmado, NFC-e confirmada e cliente anonimizada.
- Um processo separado reivindica lotes com `FOR UPDATE SKIP LOCKED`, publica no BullMQ com `jobId` igual ao UUID do outbox e recupera itens `queued` abandonados.
- O consumidor processa com retentativa exponencial e marca o registro como `processed`; falhas esgotadas ficam visíveis como `failed` com a última mensagem.
- Payloads assíncronos carregam identificadores e dados mínimos do evento, não cópias pessoais desnecessárias.
- O worker expõe saúde própria e é executado separadamente da API, embora compartilhe a mesma base de código do monolito modular.

## Consequências

Uma indisponibilidade momentânea do Redis não perde o evento confirmado no banco. Consumidores futuros devem continuar idempotentes, pois entrega confiável é pelo menos uma vez. O ambiente local usa a conexão administrativa apenas para despachar todos os tenants; produção deverá fornecer `DATABASE_WORKER_URL` de um papel dedicado, com acesso limitado à outbox e permissão controlada para atravessar RLS.
