# ADR 0033 — Exportação e anonimização de clientes

**Estado:** aceito e implementado em 27 de agosto de 2026.

## Contexto

A proprietária precisa atender solicitações de acesso e remoção sem apagar os fatos fiscais, financeiros e operacionais que sustentam pedidos já executados. Excluir a cliente em cascata quebraria custo, recebimentos, auditoria e histórico do negócio.

## Decisão

- A exportação reúne cadastro, endereços, preferências, pedidos, itens e recebimentos em JSON estruturado.
- A anonimização exige motivo e a confirmação literal `ANONIMIZAR`.
- Nome, contato, endereços, observações e cópias pessoais presentes em pedidos são substituídos dentro da mesma operação.
- Pedidos, valores, recebimentos e identificadores técnicos permanecem para cumprir obrigações e preservar a consistência gerencial.
- O cadastro fica inativo, recebe `anonymized_at` e não volta a ser usado em novos pedidos.
- Exportação e anonimização geram eventos de auditoria sem reproduzir o conteúdo pessoal nos próprios eventos.

## Consequências

A aplicação consegue entregar uma cópia legível e reduzir os dados pessoais sem adulterar o livro operacional. Políticas jurídicas de prazo de retenção ainda precisam ser confirmadas para cada ambiente real; o sistema oferece o mecanismo técnico, não presume a base legal.
