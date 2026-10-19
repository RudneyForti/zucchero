# 0007 — Receita-base, encomenda e versões

**Status:** aprovada e implementada no MVP  
**Data:** 25/08/2026

## Decisão

Uma receita é um modelo culinário reutilizável e recebe o nome do produto, como
`Bolo de chocolate`. Cliente, ocasião, decoração e personalizações pertencem à
encomenda que instancia essa receita, como “bolo de chocolate para Marina”.

O caderno mostra uma receita por produto e sua versão de trabalho mais recente.
Ao abrir o cartão, a usuária encontra composição, rendimento, custo conhecido e
momentos/etapas no mesmo diálogo.

## Regra de alteração

- a interface chama o estado não publicado de **Em edição**; `draft` permanece
  apenas como nome técnico interno;
- uma receita pode ter no máximo uma edição em andamento;
- edições em andamento podem ser alteradas diretamente;
- uma versão publicada é imutável;
- alterar uma receita publicada cria uma nova edição, preenchida a partir da
  atual;
- a numeração não é apresentada enquanto o conteúdo está em edição; a ação
  final informa qual número será atribuído pela publicação;
- a nova edição pode ser guardada para continuar depois ou publicada;
- pedidos existentes mantêm a versão que foi escolhida no momento da criação;
- uma versão publicada anterior continua disponível enquanto a atualização
  estiver em edição.

A prévia de uma importação por URL é temporária e não constitui um estado da
receita. Confirmá-la cria a receita em edição; somente a publicação a torna
selecionável em novos pedidos.

Essa separação evita que uma melhoria futura em rendimento, ingrediente ou tempo
reescreva o custo e o roteiro de encomendas já assumidas.
