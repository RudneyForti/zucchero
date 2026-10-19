# 0021 — Execução local integrada com Docker

## Status

Aceita.

## Contexto

O desenvolvimento vinha usando processos Node separados para web e API, enquanto PostgreSQL e Redis eram iniciados por um Compose auxiliar. Isso exigia vários comandos, deixava portas técnicas expostas e tornava fácil validar uma instância diferente daquela pretendida.

Também foi solicitada a execução da aplicação na porta `6000`. O servidor responde nessa porta, porém Chromium a bloqueia no cliente como `ERR_UNSAFE_PORT` por ela ser historicamente reservada ao X11.

## Decisão

Manter um Compose na raiz com quatro responsabilidades isoladas:

- `web`: imagem Next.js standalone, publicada em `6000` e `6001`;
- `api`: imagem NestJS acessível somente pela rede interna;
- `postgres`: banco persistente sem porta publicada no host;
- `redis`: cache e futura fila, também somente interno;
- `migrate`: tarefa transitória que aplica migrations e seed antes da API iniciar.

A porta `6000` permanece disponível conforme solicitado. A porta `6001` é o endereço recomendado para navegação, pois não sofre o bloqueio preventivo dos navegadores Chromium.

As imagens executam com usuário não-root. Healthchecks e dependências condicionais impedem que web e API sejam anunciadas antes de banco, migrations e serviços necessários estarem prontos.

## Consequências

- um único comando constrói e inicia toda a aplicação;
- migrations e dados demonstrativos são reproduzíveis;
- dados locais persistem em volumes nomeados;
- somente a superfície web fica exposta ao host;
- o ambiente continua sendo local e demonstrativo, não uma publicação de homologação ou produção;
- o adaptador provisório de tenant segue restrito a `NODE_ENV=development` até a integração com Cognito.
