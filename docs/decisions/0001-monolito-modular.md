# ADR 0001 — Monolito modular

**Estado:** aceito  
**Data:** 24/08/2026

## Contexto

Estoque, receita, pedido, produção e resultado compartilham regras transacionais fortes. Separá-los desde o início elevaria custo operacional e dificultaria a evolução por uma equipe pequena.

## Decisão

O backend será um monolito modular NestJS. Cada módulo controla suas tabelas e serviços de aplicação públicos; efeitos posteriores usam eventos internos e outbox. Frontend, API e worker podem executar em processos distintos sem transformar os domínios em microserviços.

## Consequências

- deploy e transações permanecem simples no MVP;
- testes de arquitetura impedirão imports indevidos entre módulos;
- importação fiscal e notificações são candidatas futuras a extração;
- estoque, receita, pedido e produção permanecem juntos até existir evidência concreta para separação.
