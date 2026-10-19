# 0038 — Identidade local do piloto

## Estado

Aceita e implementada em 29 de agosto de 2026.

## Contexto

A fundação AWS e o adaptador Cognito já existem, mas a conta de nuvem não estará disponível durante o primeiro piloto. A aplicação precisa permitir cadastro, autenticação e isolamento real de pequenas confeitarias no ambiente Docker, sem transformar dados demonstrativos em credenciais compartilhadas.

## Decisão

- o PostgreSQL armazena uma credencial local por usuária, sempre como derivação `scrypt` com salt aleatório;
- o cadastro cria tenant, proprietária, associação, configurações padrão e credencial numa única função transacional;
- o cadastro também pode guardar imagem e endereço básicos da confeitaria; ambos são opcionais e editáveis em Ajustes;
- o login emite uma sessão HMAC de curta duração, guardada somente em cookie HttpOnly pelo servidor web;
- a API valida assinatura, validade, sujeito e associação ao tenant antes de abrir qualquer módulo de negócio;
- Row-Level Security continua sendo a última barreira entre empresas;
- o provedor local só pode ser habilitado fora de `NODE_ENV=production`;
- a conta demonstrativa com TOTP permanece separada para validar a experiência de MFA;
- contas locais não passam por uma falsa confirmação de e-mail; esse passo reaparece quando Cognito e envio real estiverem disponíveis.

## Migração futura

A identidade é tratada como um adaptador. Na migração AWS, cada proprietária será vinculada a um `sub` Cognito, mantendo o UUID do tenant e todos os registros do domínio. Recuperação de senha, confirmação de e-mail, política avançada de sessão e MFA individual passam a ser responsabilidade do Cognito.

Durante o piloto, imagens pequenas permanecem como data URL no PostgreSQL para que o Compose seja autocontido. Na migração AWS, elas serão movidas ao S3 e o tenant passará a guardar apenas a chave ou URL controlada do objeto.

## Consequências

O piloto pode operar integralmente em uma única máquina com dados persistentes e contas isoladas. Em contrapartida, o ambiente local depende de backup do volume PostgreSQL e não deve ser publicado diretamente na internet como solução de produção.
