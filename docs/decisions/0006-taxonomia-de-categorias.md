# 0006 — Taxonomia de categorias da Despensa

**Estado:** implementada  
**Data:** 25 de agosto de 2026

## Decisão

Categoria é uma família ampla, estável e reutilizável para navegação, filtro e relatórios. Ela não representa marca, apresentação comercial nem o nome exato do ingrediente.

Exemplos corretos:

- `Chocolates e cacaus` contém Chocolate meio amargo, Cacau em pó 100% e Chocolate branco;
- `Farinhas e secos` contém Farinha de trigo, Amido e Fermento;
- `Cremes e laticínios` contém Chantilly, Creme de leite e Leite condensado.

Exemplo a evitar: categoria `Cacau em pó` para o grupo `Cacau em pó 100%`, pois isso duplica o mesmo nível semântico.

## Tipos

- **Ingrediente:** entra na composição de uma receita;
- **Embalagem:** acompanha o produto vendido e participa do custo em unidades;
- **Consumo operacional:** é consumido na rotina, mas não compõe o produto entregue.

Máquinas e ferramentas não são categorias: pertencem ao módulo Equipamentos. Gás, aluguel e internet também não são categorias de estoque: pertencem ao Financeiro.

## Interface

- categorias são cadastradas numa tarefa própria dentro da Despensa;
- a entrada manual apenas seleciona uma categoria existente por busca;
- a prateleira combina busca textual e filtro pesquisável de categoria;
- quantidade de embalagens é sempre um inteiro positivo; conteúdo da embalagem continua aceitando decimal.

## Persistência

`ingredient_categories` pertence ao tenant e possui nome normalizado, tipo e estado ativo. `ingredient_groups.category_id` referencia essa entidade. O texto da categoria permanece denormalizado temporariamente para compatibilidade de projeção e será removido numa migração de consolidação.
