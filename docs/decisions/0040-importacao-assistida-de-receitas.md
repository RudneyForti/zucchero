# ADR 0040 — Importação assistida de receitas por URL

**Estado:** aceito e implementado em 31 de agosto de 2026.

## Contexto

Receitas externas quase nunca usam a mesma nomenclatura, unidade ou divisão de trabalho do Zucchero. Copiar cada campo manualmente é lento, mas gravar diretamente o conteúdo extraído seria perigoso: peso final, colheres, unidades, tempos passivos e categorias frequentemente dependem de inferência.

## Decisão

- O importador começa pelos dados estruturados `Recipe` ou `HowTo` presentes na página. Esse extrator determinístico fornece um rascunho reproduzível e rastreável.
- Quando a página não oferece uma divisão estrutural suficiente, um modelo pequeno executado pelo Ollama reorganiza o texto culinário e o rascunho determinístico no contrato do Zucchero. O modelo atual é `qwen3:4b`, isolado em container e sem enviar a receita para um serviço externo. O modo de raciocínio do modelo permanece desativado (`think: false`): a IA funciona como fallback semântico, não como calculadora de quantidades.
- Se a fonte já traz duas ou mais subpreparações nomeadas em `HowToSection`, elas são preservadas na ordem original e o rascunho determinístico não passa pela IA. Isso evita que uma divisão editorial válida, como mascarpone, biscoito, creme e montagem, seja reagrupada por similaridade e também reduz a latência.
- A resposta da IA é JSON estruturado e precisa passar por validação de tipos e regras semânticas: referências únicas, ingredientes ligados a etapas existentes, conversões matematicamente consistentes e precedências válidas. Se a IA falhar, a prévia determinística continua disponível com confiança baixa e um aviso explícito.
- Toda URL é validada no servidor, aceita apenas HTTP(S), rejeita endereços privados, limita redirecionamentos, tamanho da resposta e tempo de leitura.
- A análise gera uma prévia sem qualquer escrita. Ela normaliza ingredientes, converte tudo para gramas, classifica categorias, divide etapas em momentos e sinaliza toda inferência.
- O nome do grupo culinário é sempre um conceito curto e reutilizável, como `Creme de leite fresco`. Quantidade, embalagem, marca, teor, variedade, estado e forma de uso não participam dessa identidade. Detalhes válidos somente naquela receita, como `para bater chantilly, com 35% de gordura`, ficam na especificação da linha e o texto integral da fonte permanece visível para conferência.
- Para conceitos conhecidos, a normalização determinística é soberana mesmo quando a IA devolve uma expressão mais longa. O modelo local ajuda a interpretar ingredientes desconhecidos, mas não pode fragmentar o catálogo criando um novo grupo para cada redação editorial.
- Medidas quantitativas declaradas pela fonte têm precedência sobre aproximações: o importador reconcilia o JSON estruturado com notas visíveis do ingrediente, entende frações tipográficas e mistas, normaliza litros e xícaras como volume, diferencia colher de sopa e colher de chá, usa uma alternativa explícita em gramas quando disponível e interpreta expressões como “60 gramas cada”. Formas, aros e assadeiras são tratados como utensílios e não entram no estoque nem no rendimento.
- Preparos intermediários não são somados duas vezes. Quando uma seção produz, por exemplo, mascarpone e outra linha informa quantos gramas desse mascarpone entram no produto final, os insumos da seção produtora ficam fora do cálculo final de rendimento e a decisão aparece nos avisos da prévia.
- Quando a fonte apresenta uma faixa de porções, a prévia conserva o limite inferior como valor operacional e informa a faixa completa em um aviso. O rendimento em peso é calculado sobre a massa normalizada dos ingredientes com a perda técnica explícita; a IA recebe esses números para auditoria, mas não substitui as regras aritméticas determinísticas.
- A confirmação relê a fonte e executa uma única transação: reutiliza grupos culinários equivalentes, cria categorias e grupos ausentes e abre a receita para edição.
- A versão preserva nome, URL, autoria, data de acesso, método de importação e avisos. A fonte pertence à versão, pois adaptações futuras podem partir de referências diferentes.
- Receitas importadas nunca são publicadas automaticamente. Rendimento, conversões e tempos inferidos exigem revisão humana e, idealmente, validação na primeira produção.
- O nome sugerido pela fonte pode ser alterado na confirmação, sem modificar a autoria preservada. Isso permite manter variações de teste — por exemplo, `Brownie 2` — como receitas distintas.
- O serviço de IA mantém o modelo em volume Docker, conserva-o aquecido por cinco minutos após a inferência e não é publicado em porta do host. Esse intervalo reduz drasticamente a espera ao confirmar uma prévia, mas devolve GPU e memória depois da janela de uso. API e importador continuam sendo a única fronteira de entrada.
- A IA pode reunir instruções consecutivas em menos etapas quando elas formam uma única ação culinária, desde que não condense o preparo abaixo do limite de segurança nem descarte ingredientes. Essa reorganização é registrada nos avisos da prévia.
- A IA não define livremente a cronologia. Depois da inferência, o Zucchero aplica uma ontologia culinária determinística na ordem `Mise en place → Massa ou bases → Preparação → Forno → Finalização`. A mise en place padrão separa e pesa os ingredientes; preparar a forma e preaquecer pertencem à Preparação; levar ao forno, assar e verificar o ponto pertencem ao Forno; resfriar e desenformar pertencem à Finalização.
- A classificação considera a ação completa e usa limites de palavras. Assim, `formaram bolsas de farinha` não é confundido com `forma`, `recorte o papel` não é confundido com `corte/porcionamento` e uma observação antecipada sobre o forno não altera a posição cronológica do cozimento.
- Tempos informados pela fonte continuam soberanos. Para ações curtas sem tempo declarado, regras conservadoras impedem sugestões absurdas do modelo, como dezenas de minutos para untar a forma ou conferir o ponto.
- A prévia exibe a medida textual original de cada ingrediente e permite expandir cada momento para ler os passos, durações e instruções completas. Nomes de momentos sozinhos não constituem uma ficha técnica revisável.
- A informação de que momentos e etapas foram reconhecidos automaticamente é metadado da importação, não resultado culinário de um momento. Ela aparece uma única vez no início da seção; nunca é repetida em cada momento nem levada ao campo editável de resultado.

## Consequências

A confeiteira ganha velocidade sem perder autoria nem controle operacional. O catálogo culinário cresce junto com o caderno, mas não recebe marcas, teores ou instruções como novos ingredientes e não cria lotes de estoque fictícios. A primeira inicialização exige o download local do modelo e cada análise leva mais tempo que o extrator determinístico; em troca, a divisão em momentos e etapas combina interpretação da IA com uma cronologia culinária estável e auditável. A importação automática prepara uma edição; a experiência e a balança continuam decidindo o que será publicado.
