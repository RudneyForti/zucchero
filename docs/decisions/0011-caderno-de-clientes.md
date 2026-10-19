# 0011 — Caderno de clientes

**Status:** implementada  
**Data:** 25/08/2026

## Decisão

Clientes formam um módulo próprio do monolito, mas permanecem deliberadamente
leves para o perfil unipessoal do MVP. O mesmo acesso da proprietária consulta,
cria e cuida dos cadastros; não há fluxo de vendedor, atendente ou aprovação.

O cadastro mínimo exige apenas nome e telefone. E-mail, observações,
preferências de entrega e pagamento e até cinco endereços são opcionais. Essa
progressão preserva a velocidade do atendimento e aplica minimização de dados:
só se guarda o que ajuda a reconhecer a cliente, combinar o pedido ou realizar
a entrega.

## Identidade e duplicidade

O telefone normalizado é a chave de comparação assistida dentro de cada
empresa. Ao receber um número já ativo, a API não cria uma segunda pessoa: ela
responde com conflito e informa a candidata existente para que a interface
ofereça a abertura do cadastro correto.

O banco mantém índice único por `tenant_id` e telefone normalizado. Portanto, a
proteção existe tanto na conversa da interface quanto no limite transacional.
Não há mesclagem automática de pessoas, pois nomes e endereços semelhantes
podem pertencer a clientes diferentes.

## Endereços e preferências

Cada cliente pode manter até cinco endereços ativos, com:

- nome curto do lugar, como Casa ou Trabalho;
- pessoa que recebe;
- CEP, logradouro, número, complemento, bairro, cidade e UF estruturados;
- instrução opcional de chegada;
- indicação de um único endereço principal.

Ao completar oito dígitos, a interface consulta o CEP pelo servidor e sugere
logradouro, bairro, cidade e UF. Todos os valores continuam editáveis e uma
falha externa nunca impede o preenchimento manual. A resposta assíncrona não
substitui número ou complemento já informados. Além dos campos estruturados, o
sistema mantém uma versão textual composta para busca, cartões e snapshots de
pedidos.

Preferências de entrega e pagamento funcionam como ponto de partida, nunca como
regra rígida. Ao selecionar a cliente em um novo pedido, a jornada preenche o
modo habitual e o endereço principal; a proprietária pode alterar tudo para
aquela encomenda sem modificar o cadastro.

## Histórico e isolamento

O cartão exibe a quantidade de pedidos vinculados e o resumo de entrega. Pedidos
continuam preservando seus próprios snapshots, portanto editar o cadastro não
reescreve encomendas antigas.

Clientes e endereços usam `tenant_id`, chaves estrangeiras compostas e RLS
forçado. Criação e edição registram eventos de auditoria. Endereços retirados do
cadastro são desativados, não apagados fisicamente.

## Interface

A tela assume a linguagem de um caderno de relações: busca única, cartões
inteiros clicáveis e um diálogo progressivo em três momentos — reconhecimento,
entrega e pequenos combinados. A abertura do diálogo sempre retorna ao topo e
preserva o título em telas pequenas.

## Limite deste corte

Busca já cobre nome, telefone, e-mail e endereço. Importação de contatos,
consentimentos por canal, anonimização sob solicitação e linha do tempo detalhada
de pedidos entram em fatias posteriores, quando houver necessidade operacional
comprovada.
