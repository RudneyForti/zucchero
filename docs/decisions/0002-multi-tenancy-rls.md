# ADR 0002 — Multi-tenancy com RLS

**Estado:** aceito  
**Data:** 24/08/2026

## Contexto

Cada confeitaria precisa operar como tenant isolado. Um filtro esquecido na aplicação não pode ser suficiente para expor dados de outra empresa.

## Decisão

Usar banco PostgreSQL compartilhado, `tenant_id` nas tabelas pertencentes à empresa e Row-Level Security como defesa em profundidade. A API deriva o tenant da identidade validada e define `app.current_tenant_id` dentro da transação.

## Consequências

- consultas de negócio devem executar dentro de contexto transacional;
- jobs e eventos carregam tenant e correlação explicitamente;
- testes usam usuário PostgreSQL não-superusuário;
- bootstrap de nova empresa exigirá uma função ou serviço administrativo restrito;
- RLS não substitui autorização funcional nem revisão de contratos HTTP.
