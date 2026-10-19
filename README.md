# Zucchero

Fundação executável da aplicação de operação diária para pequenas confeitarias.

Este repositório implementa o **Marco 0** e as primeiras fatias operacionais dos **Marcos 1A — Despensa**, **1B — Receita publicável** e **1C — Cliente, encomenda e preço**: monorepo, sistema visual aprovado, API modular, contexto de tenant, migrations versionadas, políticas de Row-Level Security e dados demonstrativos coerentes.

## O que já funciona

- tela Hoje responsiva em Next.js, baseada no layout aprovado;
- janela curva com rolagem interna, aside suspenso e navegação móvel;
- agenda Hoje gerada a partir dos momentos da versão exata da receita confirmada;
- card de foco com pedido, produto final, momento, tarefa, instrução, massa e horário reais;
- execução persistida para começar, colocar em espera, retomar e concluir tarefas;
- avanço automático entre tarefas e momentos, levando o pedido a `em produção` e `pronto`;
- navegação real entre Hoje e Despensa;
- visão da despensa organizada por grupo culinário, sem confundir marca com ingrediente;
- entrada manual de compra que cria lote e movimento de estoque;
- prevenção assistida de possíveis duplicidades antes de cadastrar uma apresentação;
- alertas de validade e estoque mínimo;
- saldos por lote separados entre físico, reservado e livre;
- contagem de inventário por diferença imutável, idempotente e auditável;
- registro de perda limitado ao saldo livre e protegido por confirmação explícita;
- lista de compras consolidada entre pedidos, com embalagens calculadas e entrada manual já preenchida;
- importação assistida de NFC-e por câmera, URL ou chave, com revisão linha a linha;
- sugestões de apresentação por GTIN ou nome, sem confirmação silenciosa;
- confirmação fiscal transacional e proteção contra entrada duplicada da mesma chave;
- controles próprios e acessíveis para listas pesquisáveis, datas e valores numéricos;
- ritmo de espaçamento padronizado e regiões roláveis recortadas pelas superfícies curvas;
- tela Receitas com consulta, rendimento, custo estimado e trilha de momentos;
- cadastro progressivo de ingredientes em gramas, preferência de apresentação e etapa de uso;
- conversões auditáveis com quantidade original, unidade, fator, fonte e confiança;
- receitas compostas por versões publicadas, com rendimento necessário e momento de uso;
- explosão recursiva dos componentes no custo, estoque, reserva e lista de compras;
- precedências executáveis, caminho crítico e liberação paralela somente após todos os pré-requisitos;
- salvamento real como rascunho ou primeira versão publicada;
- rota Pedidos com jornada guiada em quatro passos;
- escala da versão publicada, disponibilidade por grupo e arredondamento de faltas em embalagens comerciais;
- preço sugerido por margem, lucro estimado, markup informativo, sinal e forma de pagamento;
- confirmação transacional do pedido com snapshot da versão, preço recalculado pela API e numeração por empresa;
- reserva FEFO por lote, movimento imutável de estoque e geração automática de necessidades de compra;
- idempotência de confirmação para impedir pedidos e reservas duplicados;
- ciclo do pedido de confirmado a concluído, com ação principal contextual e histórico recente;
- cancelamento auditável com motivo, liberação compensatória de reservas e retirada das faltas abertas;
- conclusão com conciliação entre reserva e consumo definitivo por movimentos imutáveis;
- apontamento por tarefa com planejado, usado e perda, liberação da sobra e bloqueio de conclusão até a conferência;
- correção compensatória do consumo com motivo, valores anteriores preservados e movimento somente pela diferença líquida;
- análise derivada entre planejado, usado e perda por ingrediente, tarefa e pedido, com tolerância operacional e indicação explícita de apontamento parcial;
- resultado do pedido com custo estimado versus custo dos lotes realmente consumidos, incluindo perdas e correções compensatórias;
- acerto do pedido com recebimentos parciais, taxas, saldo da cliente e estornos compensatórios auditáveis;
- despesas diretas reconciliadas com o orçamento do pedido, incluindo gastos imprevistos e estornos;
- Financeiro mensal em linguagem direta, separando recebimentos, taxas, contas pagas e compromissos em aberto;
- comparação com o mês anterior, leitura de contas por categoria e exportação CSV segura do fechamento;
- despesas operacionais únicas ou recorrentes, categorias pesquisáveis, pagamentos parciais e estornos compensatórios;
- cadastro de máquinas e ferramentas, histórico de manutenção e participação manual em pedidos;
- tipo de equipamento declarado na etapa da receita, alocação automática no plano e aviso de conflito na bancada;
- uso do equipamento registrado automaticamente ao concluir a tarefa, preservando o apontamento manual;
- receita dos pedidos apoiados por equipamento, nomeada como indicador não aditivo e separada do Financeiro;
- ajustes da confeitaria com identidade, consulta assistida de CEP, perfil pessoal, margem, sinal, pagamento, entrega e horários persistidos;
- novos pedidos preenchidos pelos presets da confeitaria, preservando a preferência específica da cliente e a edição por encomenda;
- lucro e margem realizados somente após conciliação completa, sem apresentar um apontamento parcial como fechamento;
- produto final e preparações intermediárias instanciados por pedido, com cada tarefa ligada ao que realmente está sendo produzido;
- ajuste de entrega no detalhe do pedido, com prévia do impacto, versão do plano e replanejamento transacional apenas das tarefas futuras;
- fila Hoje reservada a outros pedidos, sem repetir as etapas já presentes na trilha do foco;
- alerta da bancada conectado às faltas reais da lista de compras;
- caderno de clientes pesquisável, com cadastro e edição em diálogo progressivo;
- telefone normalizado com prevenção transacional de duplicidade e retomada assistida do cadastro existente;
- múltiplos endereços, indicação de principal e preferências opcionais de entrega e pagamento;
- preenchimento inicial do pedido a partir das preferências e do endereço principal da cliente;
- minimização de dados, orientação contra anotações sensíveis e auditoria de criação e edição;
- exportação estruturada e anonimização confirmada da cliente, preservando fatos financeiros e fiscais;
- categorias de estoque normalizadas, pesquisáveis e classificadas por finalidade;
- capacidade simultânea e períodos programados de indisponibilidade por equipamento;
- replanejamento que valida conflitos de equipamento antes de alterar tarefas futuras;
- PWA instalável com cache de páginas visitadas, fallback e aviso acessível de conexão;
- autenticação de produção preparada para validar Cognito, criar conta com confirmação por e-mail e formar o tenant isolado no primeiro acesso;
- cadastro e autenticação local persistentes para o piloto Docker, com senha derivada, sessão HttpOnly assinada e um tenant isolado por conta;
- convites locais com token armazenado somente como hash, validade de sete dias e aceite dentro do tenant existente;
- grupos Operacional e Financeiro aplicados na navegação e na API, com proprietária Full obrigatória;
- gestão de pessoas, revogação de convites, remoção de acessos e exclusão confirmada da própria conta;
- fundação AWS versionada em CloudFormation para Cognito, ECR, S3, Secrets Manager, ECS e logs;
- outbox transacional e worker BullMQ separados, com retentativa e recuperação de entregas abandonadas;
- projeção Hoje fornecida pela API NestJS;
- endpoints de saúde e documentação OpenAPI;
- header de tenant permitido somente em desenvolvimento;
- schema inicial de tenants, usuários, vínculo da proprietária, configurações e auditoria;
- schema de grupos de insumo, marcas, itens comerciais, lotes e movimentos imutáveis;
- RLS forçado nas tabelas multi-tenant;
- migration com checksum e seed reproduzível para duas empresas;
- testes unitários e teste de integração adversarial entre tenants.

## Estrutura

```text
apps/
├─ web/       Next.js, interface e PWA
└─ api/       NestJS, Fastify e módulos do negócio
infra/
└─ local/     PostgreSQL e Redis para desenvolvimento
design-system/
└─ confeitaria/MASTER.md
docs/
└─ decisions/   decisões arquiteturais e visuais versionadas
```

Referências principais:

- [sistema visual aprovado](design-system/confeitaria/MASTER.md);
- [evolução visual e controles](docs/decisions/0004-sistema-visual-e-controles.md);
- [primeira fatia de Receitas](docs/decisions/0005-primeira-fatia-de-receitas.md);
- [taxonomia de categorias](docs/decisions/0006-taxonomia-de-categorias.md);
- [receita-base, encomenda e versões](docs/decisions/0007-receita-base-e-versoes.md);
- [simulação de escala e fracionamento](docs/decisions/0008-simulacao-de-escala.md);
- [primeira fatia de Pedidos](docs/decisions/0009-primeira-fatia-de-pedidos.md);
- [pedidos transacionais](docs/decisions/0010-pedidos-transacionais.md);
- [ciclo de vida do pedido](docs/decisions/0012-ciclo-de-vida-do-pedido.md);
- [plano de produção e bancada persistida](docs/decisions/0013-plano-producao-bancada.md);
- [ficha de preparo e observação operacional](docs/decisions/0014-ficha-preparo-observacoes.md);
- [ingrediente ligado à etapa de uso](docs/decisions/0015-ingrediente-etapa-de-uso.md);
- [consumo real por tarefa](docs/decisions/0016-consumo-real-por-tarefa.md);
- [preparações instanciadas no pedido](docs/decisions/0017-preparacoes-instanciadas-no-pedido.md);
- [correção compensatória do consumo](docs/decisions/0019-correcao-compensatoria-consumo.md);
- [divergência entre planejado e realizado](docs/decisions/0020-divergencia-planejado-realizado.md);
- [resultado de custo do pedido](docs/decisions/0022-resultado-custo-do-pedido.md);
- [recebimentos e estornos do pedido](docs/decisions/0023-recebimentos-e-estornos.md);
- [despesas diretas do pedido](docs/decisions/0024-despesas-diretas-do-pedido.md);
- [Financeiro mensal por compromisso e caixa](docs/decisions/0025-financeiro-mensal.md);
- [comparação, categorias e exportação financeira](docs/decisions/0028-comparacao-categorias-exportacao-financeira.md);
- [configurações da confeitaria e presets operacionais](docs/decisions/0029-configuracoes-da-confeitaria.md);
- [inventário, perdas e compras consolidadas](docs/decisions/0030-inventario-perdas-compras-consolidadas.md);
- [importação assistida de NFC-e](docs/decisions/0031-importacao-assistida-nfce.md);
- [receitas compostas, conversões e precedências executáveis](docs/decisions/0032-receitas-compostas-conversoes-precedencias.md);
- [exportação e anonimização de clientes](docs/decisions/0033-privacidade-e-anonimizacao.md);
- [capacidade, indisponibilidade e replanejamento](docs/decisions/0034-capacidade-indisponibilidade-e-replanejamento.md);
- [PWA e operação offline segura](docs/decisions/0035-pwa-e-operacao-offline-segura.md);
- [identidade Cognito e fundação AWS](docs/decisions/0036-identidade-cognito-e-fundacao-aws.md);
- [outbox transacional e worker BullMQ](docs/decisions/0037-outbox-transacional-e-worker.md);
- [identidade local do piloto](docs/decisions/0038-identidade-local-do-piloto.md);
- [equipamentos, manutenção e receita apoiada](docs/decisions/0026-equipamentos-e-receita-apoiada.md);
- [alocação e uso automático de equipamentos](docs/decisions/0027-alocacao-e-uso-automatico-de-equipamentos.md);
- [execução local integrada com Docker](docs/decisions/0021-execucao-docker-local.md);
- [caderno de clientes](docs/decisions/0011-caderno-de-clientes.md);
- [monolito modular](docs/decisions/0001-monolito-modular.md);
- [isolamento multi-tenant](docs/decisions/0002-multi-tenancy-rls.md).
- [roteiro de homologação e piloto](docs/homologacao-e-piloto.md).

## Requisitos

- Node.js compatível com a versão declarada no `package.json`;
- pnpm 11;
- Docker Desktop para PostgreSQL e Redis locais.

## Executar localmente

### Aplicação completa com Docker

Na raiz do projeto:

```bash
pnpm docker:up
```

O comando constrói a aplicação, sobe PostgreSQL e Redis, aplica migrations, executa o seed idempotente e inicia API e web. Somente a interface é publicada no host; API, banco e Redis permanecem na rede interna do Compose.

Endereços:

- aplicação no navegador: `http://localhost:6001`;
- porta adicional solicitada: `http://localhost:6000` (responde por HTTP, mas é bloqueada por Chromium como porta insegura/reservada);
- API, PostgreSQL e Redis: acesso apenas entre os contêineres.

Comandos de operação:

```bash
pnpm docker:logs
pnpm docker:down
```

Os dados persistem nos volumes nomeados `confeitaria_postgres` e `confeitaria_redis` mesmo após `docker:down`.

Com `AUTH_REQUIRED=true` e `LOCAL_AUTH_ENABLED=true`, a tela de entrada permite criar contas reais para o piloto. Cada cadastro cria sua própria confeitaria, proprietária, associação e configurações padrão no PostgreSQL. O cadastro aceita imagem e endereço opcionais da confeitaria, com consulta assistida de CEP; Ajustes mantém a identidade do negócio separada do nome e da imagem pessoais. Como o ambiente local não possui serviço de e-mail, a conta fica disponível imediatamente; confirmação por código permanece reservada ao Cognito na futura publicação AWS.

### Desenvolvimento com hot reload

Na raiz do projeto:

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Endereços padrão:

- aplicação: `http://localhost:3000`;
- API: `http://localhost:3001/v1`;
- OpenAPI: `http://localhost:3001/v1/docs`.

As variáveis necessárias estão documentadas em `.env.example`. Para desenvolvimento sem login, o web envia o tenant demonstrativo `11111111-1111-4111-8111-111111111111`. No piloto protegido, a sessão local assinada tem precedência e vincula a conta ao tenant armazenado no banco. Ambos os mecanismos locais são recusados quando `NODE_ENV=production`; a publicação externa dependerá de identidade validada pelo adaptador Cognito.

Para calcular entregas, habilite a Routes API e a Maps Static API no projeto Google Maps Platform e preencha `GOOGLE_MAPS_API_KEY` no `.env`. A chave é usada somente pela API no servidor e deve receber restrições de API e de aplicação. Em Ajustes, complete o endereço estruturado da confeitaria e defina o custo por quilômetro; o pedido então calcula a rota de ida até o endereço cadastrado da cliente, mostra o percurso e inclui esse valor no custo antes da margem. Se a Maps Static API estiver indisponível, distância, duração e custo continuam funcionando sem a imagem.

## Qualidade

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Com PostgreSQL e o seed ativos:

```bash
pnpm --filter @confeitaria/api test:integration
```

O teste de integração assume o usuário não-superusuário `confeitaria_app`, garantindo que o PostgreSQL realmente aplique RLS. A suíte E2E usa Chromium para percorrer as oito áreas, os diálogos críticos, o service worker e o recorte automatizável de WCAG A/AA.

## Segurança da fundação

- o tenant não será escolhido livremente pelo navegador em produção;
- cada transação de negócio receberá `app.current_tenant_id` antes de acessar dados;
- tabelas multi-tenant usam `ENABLE` e `FORCE ROW LEVEL SECURITY`;
- logs removem autorização e cookies;
- requisições recebem identificador de correlação;
- migrations aplicadas não podem ser editadas sem disparar erro de checksum;
- fatos de estoque e dinheiro serão corrigidos por movimentos compensatórios, não exclusão.

## Limites conscientes deste corte

- o piloto Docker possui cadastro, login, sessão HttpOnly, convites, grupos de acesso, saída e isolamento por tenant; recuperação de senha, envio automático de convites, confirmação de e-mail e MFA individual entram com Cognito/SES na publicação AWS;
- sem PostgreSQL configurado, a tela Hoje usa uma bancada demonstrativa; com banco, toda a agenda é persistida;
- o planejador respeita o grafo de precedências, calcula o caminho crítico, libera ramos paralelos e respeita capacidade e indisponibilidade; otimização global entre vários pedidos continua pendente;
- preparações intermediárias já possuem instância própria e vínculo com o produto final, mas ainda não geram lote interno; produção antecipada para vários pedidos exigirá um fluxo explícito de semielaborado;
- cada linha de ingrediente pode indicar a etapa em que entra; a confirmação do pedido preserva essa origem e a ficha de preparo mostra somente os insumos da tarefa quando toda a versão possui o vínculo;
- versões antigas sem associação completa continuam seguras: a ficha identifica explicitamente que as quantidades pertencem ao pedido completo;
- tarefas com ingredientes completamente mapeados exigem apontamento de uso e perda e permitem correção compensatória; versões legadas ainda conciliam reservas somente na conclusão do pedido;
- sem PostgreSQL configurado, a Despensa usa memória demonstrativa e reinicia junto com a API;
- entrada manual, inventário, ajustes, perdas e consolidação de compras já estão operacionais; a lista é uma projeção viva e ainda não remaneja reservas automaticamente após a compra;
- a jornada de NFC-e já captura, sugere, revisa e confirma lotes; extração automática por portal/UF ainda precisa ser calibrada com documentos reais anonimizados do piloto;
- Receitas já oferece ficha detalhada, edição de rascunho, versões imutáveis, conversões documentadas, componentes publicados e dependências entre etapas; equivalentes múltiplos continuam no aprofundamento;
- Pedidos já persiste a confirmação, reserva lotes, cria faltas, consolida compras, avança o ciclo e cancela com compensação; substituições e remanejamento automático entre novas compras e reservas entram no aprofundamento;
- Clientes já oferece cadastro, edição, busca, endereços, preferências, exportação e anonimização; consentimentos por canal e histórico jurídico de solicitações entram no aprofundamento;
- eventos assíncronos de pedido, NFC-e e privacidade já usam outbox + BullMQ; canais externos de notificação serão definidos no piloto;
- Equipamentos já possui aquisição, estado, manutenção, necessidade por etapa, capacidade simultânea, indisponibilidade futura, conflito operacional e uso automático; múltiplos recursos na mesma etapa, depreciação e retorno contábil permanecem fora do primeiro corte;
- Configurações já cobre identidade, presets de venda e horários; pausas, feriados, capacidade e múltiplos expedientes entram no aprofundamento do planejador;
- o modo offline é conscientemente somente leitura; escritas críticas não são enfileiradas sem uma política de reconciliação;
- a publicação de homologação e a comprovação do login contra um User Pool real dependem da configuração da conta AWS.

## Próxima entrega

Executar o piloto local com contas reais e refinar a jornada a partir do uso cotidiano. Quando conta, domínio e parâmetros estiverem disponíveis, substituir o provedor local pelo Cognito e aplicar a fundação em **homologação AWS**, preservando tenants e domínio.
