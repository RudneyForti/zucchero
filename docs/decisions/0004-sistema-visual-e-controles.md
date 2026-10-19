# 0004 — Sistema visual, controles e superfícies roláveis

**Estado:** aprovado e aplicado  
**Data:** 25 de agosto de 2026  
**Fonte de verdade:** [`design-system/confeitaria/MASTER.md`](../../design-system/confeitaria/MASTER.md)

## Contexto

Os primeiros protótipos confirmaram a direção de uma aplicação acolhedora, mas também revelaram sinais de software administrativo genérico: navegação pesada, superfícies desconectadas, controles nativos inconsistentes e barras de rolagem que rompiam as curvas da janela. A empresa piloto aprovou a metáfora de uma bancada de confeitaria — artesanal, delicada e precisa — e rejeitou o tema escuro.

## Decisão

A interface do MVP adota um sistema visual único, aplicado tanto às telas quanto aos controles de entrada:

- fundo porcelana com grade, pontos e manchas orgânicas discretas;
- janela principal curva, ocupando a viewport e contendo sua própria rolagem;
- aside claro, suspenso e separado da área de trabalho;
- barra superior translúcida com divisor em gradiente e sombra delicada;
- superfícies em papel/porcelana, títulos editoriais e ações em vinho;
- notificações fixas no canto inferior direito da janela, sem acompanhar o conteúdo;
- formulários de inserção extensos abertos em diálogo, preservando a tela de origem;
- ritmo espacial baseado em 4, 8, 12, 16, 24, 32 e 48 px;
- ao menos 16 px entre um cabeçalho com divisor e o conteúdo seguinte;
- combobox pesquisável, calendário em português e campo numérico com setas próprios;
- barras de rolagem minimalistas, sem botões nativos e recortadas pelo raio da superfície;
- redução de movimento, foco visível, alvos de toque de 44 px e ausência de rolagem horizontal a partir de 320 px.

## Comportamento dos componentes

### Combobox

Listas extensas aceitam digitação, ignoram acentos na busca, funcionam com setas, `Enter` e `Esc` e mantêm a ação de cadastrar um novo item. O valor enviado pelo formulário é explícito e independente do texto visível.

### Calendário

Datas podem ser digitadas em `dd/mm/aaaa` ou escolhidas no calendário. O popover escolhe o lado com mais espaço, usa nomes em português e preserva a navegação por teclado.

### Campo numérico

Os spinners do navegador ficam ocultos. Setas do próprio sistema respeitam `min`, `max` e `step`, sem remover a entrada direta pelo teclado.

### Diálogo e rolagem

O casco do diálogo não rola. Apenas a região interna se move. Toda superfície arredondada com rolagem usa duas camadas: `rounded-scroll-shell` recorta a forma com contenção de pintura e `clip-path`, enquanto `rounded-scroll-area` controla o overflow e a scrollbar. A sombra permanece numa camada externa ao recorte. Isso mantém barra e conteúdo dentro das curvas na janela principal, nos diálogos e nas listas pesquisáveis. A faixa lateral de destaque pertence ao casco e permanece contínua do início ao fim.

## Consequências

- novas páginas devem reutilizar esses componentes antes de criar variantes;
- elementos nativos que não possam receber o mesmo tratamento visual não devem aparecer na camada final;
- o espaçamento deve ser corrigido na estrutura da seção, nunca com margens negativas pontuais;
- toda nova região rolável precisa declarar limite, raio e recorte como um conjunto;
- o tema alternativo pode mudar tokens, mas não a hierarquia, os estados ou os padrões de interação.

## Verificação realizada

- combobox: filtro, seleção e teclado;
- calendário: digitação, conversão e abertura;
- campo numérico: incremento e decremento;
- diálogos: recorte da rolagem e fechamento por diferentes meios;
- layout: 375 px e 812 × 375 px com texto ampliado a 125%;
- preferências: `prefers-reduced-motion`;
- qualidade: formatação, tipos, lint e build de produção.
