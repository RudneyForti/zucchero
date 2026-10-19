# ADR 0029 — Configurações da confeitaria e presets operacionais

**Status:** aceita e implementada no primeiro corte  
**Data:** 27 de agosto de 2026

## Contexto

A proprietária unipessoal precisa operar a aplicação inteira com um único acesso. Ao mesmo tempo, repetir margem, sinal, pagamento, entrega e horários em toda encomenda cria trabalho e favorece erros. Esses valores devem ajudar sem impedir exceções.

## Decisão

- Dados de identidade e contato pertencem ao tenant: nome, telefone, e-mail, documento e endereço estruturado em logradouro, número, complemento, bairro, cidade, UF e CEP.
- O tenant registra explicitamente se o endereço é um ponto comercial. No primeiro corte, esse dado é informativo; poderá orientar janelas e regras de retirada sem ser reinterpretado a partir do texto do endereço.
- Nome e imagem pessoais pertencem a `app_users` e permanecem separados da identidade visual do tenant.
- O CEP pode iniciar uma consulta assistida de endereço; os dados retornados são sugestões editáveis e a indisponibilidade do serviço nunca impede o preenchimento manual. Sucesso e carregamento são anunciados sem deslocar o formulário; somente falhas mantêm mensagem visível junto ao campo.
- Preferências de operação pertencem a `tenant_settings`: margem, sinal, pagamento, entrega, fuso e horários de trabalho.
- O pedido continua guardando valores explícitos. Configurações apenas preenchem o ponto de partida; não alteram pedidos existentes.
- Preferências específicas da cliente vencem os presets da confeitaria para pagamento e entrega.
- A proprietária pode alterar qualquer preset dentro do pedido antes da confirmação.
- Horários são sete registros ordenados, cada um com disponibilidade, início e fim. Um período ativo exige fim posterior ao início.
- Alterações são isoladas por tenant e auditadas. O evento de identidade registra somente os nomes dos campos alterados, evitando replicar documento e contato na auditoria.

## Experiência

A rota `/ajustes` usa cartões editoriais independentes. No desktop, a identidade da confeitaria ocupa a primeira coluna e a segunda é dividida entre combinados de venda e perfil pessoal; ritmo da cozinha e pessoas/acessos seguem abaixo. A linguagem explica o efeito de cada escolha, preserva rótulos persistentes, envia cada bloco separadamente e confirma o salvamento com mensagem próxima e notificação discreta.

O perfil pessoal pode alterar nome de exibição e imagem. O e-mail de acesso permanece somente leitura nesse formulário; alteração de e-mail exigirá verificação em um fluxo próprio de identidade.

## Consequências

- Novos pedidos passam a respeitar os presets persistidos.
- Trocar de cliente nunca carrega silenciosamente a preferência da cliente anterior.
- Alterar um preset não recalcula encomendas já confirmadas.
- Pausas, capacidade diária, feriados e múltiplos expedientes por dia continuam como aprofundamento do planejador.
