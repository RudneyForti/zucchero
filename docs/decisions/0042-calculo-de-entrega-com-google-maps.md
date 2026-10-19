# ADR 0042 — Cálculo de entrega com Google Maps

## Contexto

Pedidos com entrega já preservam o endereço da cliente e aceitam custos adicionais, mas não existe uma regra verificável para transformar a distância desde a confeitaria em custo. Digitar um valor livre a cada encomenda cria inconsistência e mistura entrega, embalagem e outros gastos.

## Decisão

- A confeitaria define em Ajustes uma tarifa monetária por quilômetro.
- O cálculo usa a rota rodoviária de ida entre o endereço estruturado da confeitaria e o endereço cadastrado da cliente.
- A API chama o Google Maps Routes API exclusivamente no servidor. A chave não é enviada ao navegador.
- A distância retornada em metros é multiplicada pela tarifa vigente; o custo é arredondado para centavos.
- A interface mantém três valores separados: outros custos informados manualmente, custo calculado da entrega e total adicional usado na formação do preço.
- O custo da entrega compõe o custo total antes da aplicação da margem desejada.
- A cotação exibida contém distância, duração aproximada, custo e atribuição Google Maps.
- O pedido solicita a polyline da mesma rota e, quando a Maps Static API está habilitada, mostra uma imagem transitória do percurso no próprio formulário. A imagem é obtida no servidor, não é persistida e não expõe a chave ao navegador.
- A indisponibilidade do mapa ilustrativo não invalida a cotação: distância, duração, custo e assinatura continuam sendo a fonte de verdade comercial.
- Cada cotação recebe um token assinado com validade de quinze minutos. Ao confirmar, a API valida tenant, cliente, endereço, tarifa e impressão dos endereços; qualquer mudança exige um novo cálculo.
- O pedido persiste somente o custo comercial derivado. Distância, duração, resposta bruta e endereços resolvidos pelo provedor não são armazenados como dados de rota.
- Tarifa igual a zero mantém a entrega possível sem custo automático. Tarifa positiva exige integração configurada e uma cotação válida.

## Consequências

- O custo histórico do pedido não muda quando a tarifa futura for alterada.
- O endereço precisa ter logradouro, número, cidade e estado tanto na confeitaria quanto na cliente.
- Falha ou ausência da integração produz uma mensagem acionável no passo da cliente, sem esconder o preenchimento do pedido.
- A chave deve habilitar a Routes API e ser restrita ao uso servidor do projeto.
- Pedágios, estacionamento, tarifa mínima, retorno e faixas por distância permanecem evoluções futuras explícitas.
