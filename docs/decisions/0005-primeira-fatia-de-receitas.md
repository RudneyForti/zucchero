# 0005 — Primeira fatia vertical de Receitas

**Estado:** implementada  
**Data:** 25 de agosto de 2026

## Objetivo

Conectar a Despensa ao caderno de Receitas com uma operação completa: consultar preparos, cadastrar rendimento e composição, organizar momentos/etapas e guardar uma edição ou publicar uma versão.

## Decisão de domínio

- `Recipe` mantém a identidade estável do preparo;
- `RecipeVersion` guarda rendimento, perda e estado da versão;
- `RecipeLine` referencia o grupo culinário e, opcionalmente, uma apresentação preferida ou obrigatória;
- `RecipeMoment` forma os círculos que depois aparecerão no andamento do pedido;
- `RecipeStep` registra instrução, duração, tipo e possibilidade de paralelismo;
- o custo estimado usa a última aquisição conhecida da apresentação preferida ou uma referência conhecida do grupo;
- dados do módulo carregam `tenant_id` e recebem Row-Level Security desde a primeira migration.

## Entrega atual

- rota web `/receitas` e navegação ativa;
- listagem com rendimento, custo, duração, ingredientes e trilha de momentos;
- diálogo progressivo com linhas dinâmicas de ingredientes, momentos e etapas;
- busca de grupo e apresentação pelos comboboxes do sistema visual;
- ações distintas para guardar a edição e publicar uma versão;
- `GET /v1/recipes` e `POST /v1/recipes`;
- migration `0002_recipes.sql`, schema Drizzle e seed da receita piloto;
- fallback demonstrativo em memória quando PostgreSQL não está configurado;
- testes unitários de custo, projeção dos momentos e criação de edição.

## Limite deste incremento

Edição de uma versão existente, equivalentes múltiplos, embalagens, sub-receitas, dependências entre etapas, conversões guiadas e histórico detalhado de custos continuam no aprofundamento do Marco 1B. A estrutura atual preserva espaço para esses conceitos sem simulá-los na interface.
