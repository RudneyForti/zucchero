# Roteiro de homologação e piloto

Este roteiro separa o que pode ser repetido automaticamente do que precisa de decisão ou dado real da empresa piloto. Nenhum documento fiscal ou cadastro pessoal deve ser copiado para homologação sem anonimização prévia.

## 1. Entradas externas necessárias

- conta AWS e região aprovada;
- domínio/subdomínio de homologação;
- acesso para criar CloudFormation, Cognito, ECR, ECS, RDS, ElastiCache, S3, ALB, ACM, Route 53, Secrets Manager e CloudWatch;
- política de custo para NAT, tamanhos mínimos e retenção de backup;
- e-mail de teste da proprietária; o UUID definitivo do tenant é gerado pelo servidor no cadastro;
- conjunto pequeno de NFC-e reais anonimizadas, cobrindo as origens/UF mais frequentes;
- confirmação do prazo jurídico de retenção para dados fiscais e pessoais.

Para o piloto local atual, conta AWS e domínio não são pré-requisitos. Bastam Docker Desktop, uma cópia segura do `.env` e uma rotina de backup do volume PostgreSQL.

## 2. Piloto local no Docker

1. Configurar `AUTH_REQUIRED=true`, `LOCAL_AUTH_ENABLED=true`, `WEB_PUBLIC_URL=http://localhost:6001` e um `LOCAL_AUTH_SESSION_SECRET` aleatório com pelo menos 32 caracteres.
2. Executar `docker compose up -d --build` e aguardar `web`, `api`, `postgres`, `redis` e `worker` saudáveis.
3. Abrir `http://localhost:6001/entrar?cadastro=1`, informar proprietária e confeitaria, escolher imagem/endereço se desejar, criar a conta e entrar com o mesmo e-mail e senha.
4. Confirmar que o nome da nova confeitaria aparece na barra e em Ajustes, que um CEP de oito dígitos sugere logradouro, bairro, cidade e UF sem impedir edição manual, que número/complemento permanecem independentes e que a opção de ponto comercial é persistida. Confirmar também que o perfil pessoal permite alterar nome e imagem sem modificar a marca do negócio.
5. Em Meu perfil, configurar o Authenticator pelo QR Code, validar o primeiro código, sair e confirmar que a próxima entrada pede o código somente depois da senha. Depois, validar que a desativação exige a senha e um código atual.
6. Criar uma segunda conta de teste e confirmar que ela começa vazia e não enxerga os dados da primeira.
7. Manter backup do volume `confeitaria_postgres` antes de atualizações ou testes com dados reais.

O cadastro local não simula envio de e-mail: a conta fica ativa imediatamente. Cada conta local pode ativar TOTP individual em Meu perfil; o segredo é cifrado antes de persistir e o login só cria a sessão depois da confirmação. Recuperação de senha e recuperação gerenciada do segundo fator serão entregues pelo Cognito na migração AWS.

As imagens da confeitaria e do perfil pessoal são limitadas a PNG, JPG ou WebP com até 512 KB. No piloto elas permanecem no PostgreSQL para manter o Compose autocontido; na infraestrutura AWS devem migrar para S3, preservando no banco apenas as chaves dos objetos.

## 3. Antes da publicação

1. Executar `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` e `pnpm test:e2e`.
2. Subir `docker compose up -d --build` e confirmar API, web, PostgreSQL, Redis e worker como `healthy`.
3. Confirmar que `outbox_events` não possui linhas `failed` ou `pending` antigas.
4. Fazer backup lógico do banco demonstrativo se ele precisar ser preservado.
5. Validar o template `infra/aws/homologation-foundation.yaml` na conta de destino.

## 4. Identidade AWS futura

1. Aplicar a fundação conforme `infra/aws/README.md`.
2. Criar a conta pela interface, conferir a entrega do código e confirmar o e-mail.
3. Entrar e conferir que o primeiro acesso criou tenant, `app_user`, associação de proprietária e configurações padrão numa única transação.
4. Configurar web com `AUTH_REQUIRED=true`, URL pública, domínio e client ID do Cognito.
5. Configurar API com região, User Pool ID e client ID.
6. Verificar criação, entrada, retorno à rota originalmente solicitada, expiração, saída e nova entrada.
7. Tentar deliberadamente um token de outro tenant e confirmar resposta negada e ausência de dados.

## 5. Infraestrutura da aplicação

- banco e Redis em sub-redes privadas;
- API e worker sem exposição pública direta;
- web atrás do ALB com HTTPS e redirecionamento de HTTP;
- segredos apenas no Secrets Manager/Parameter Store;
- imagens identificadas por digest ou tag imutável;
- task de migration executada uma vez antes da troca do serviço;
- health checks separados para web, API e worker;
- alarmes para erro 5xx, tarefas reiniciando, conexões do banco, memória do Redis e outbox `failed`;
- backup automático, retenção definida e teste de restauração documentado.

## 6. Matriz mínima de NFC-e

Para cada documento, registrar apenas o resultado esperado e identificadores anonimizados:

| Variação                      | O que validar                                         |
| ----------------------------- | ----------------------------------------------------- |
| QR Code válido                | captura e origem reconhecidas                         |
| chave digitada                | formato, revisão e ausência de confirmação silenciosa |
| produto com GTIN conhecido    | sugestão da apresentação correta                      |
| descrição semelhante sem GTIN | sugestão com confiança visível                        |
| produto novo                  | cadastro assistido antes de confirmar                 |
| mesma chave novamente         | nenhuma duplicação de lote ou movimento               |
| validade ausente              | revisão explícita, sem data inventada                 |
| quantidade/embalagem incomum  | massa final e custo conferidos pela proprietária      |

## 7. Jornada assistida do piloto

Executar com a proprietária, observando sem conduzir cada clique:

1. cadastrar ou reconhecer um ingrediente comprado;
2. registrar uma compra manual e depois uma NFC-e;
3. consultar lote, validade, saldo livre e alerta;
4. abrir uma receita, criar uma nova edição, publicá-la e usar uma sub-receita;
5. cadastrar cliente e endereço;
6. montar pedido, interpretar custo/margem e resolver uma falta;
7. ajustar a entrega e entender um conflito de equipamento;
8. executar a bancada, registrar consumo/perda e concluir;
9. registrar recebimento, despesa e ler o resultado mensal;
10. exportar e anonimizar um cadastro criado exclusivamente para o teste;
11. perder a conexão depois de visitar uma página e interpretar corretamente o modo somente leitura.

Para cada passo, anotar: concluiu sem ajuda, tempo aproximado, dúvida verbalizada, erro cometido e confiança de 1 a 5.

## 8. Critérios de aceite

- nenhuma consulta atravessa tenants;
- nenhuma repetição cria pedido, lote, movimento ou recebimento duplicado;
- custo, reserva e consumo preservam a versão da receita confirmada;
- capacidade e indisponibilidade impedem promessas impossíveis;
- anonimização remove dados pessoais sem apagar fatos obrigatórios;
- eventos críticos chegam a `processed` ou ficam diagnosticáveis em `failed`;
- navegação por teclado, foco e leitura por tecnologia assistiva são avaliados manualmente além da suíte automatizada;
- a proprietária conclui o ciclo principal e declara que confiaria nas informações para aceitar o pedido.

## 9. Retorno seguro

Se a publicação falhar, manter a migration aplicada, voltar os serviços para a imagem anterior e não restaurar o banco por cima de fatos novos. Uma migration corretiva deve ser aditiva. Restaurar backup completo somente em incidente confirmado e com registro do ponto de recuperação.
