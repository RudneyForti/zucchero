# ADR 0036 — Identidade Cognito e fundação AWS

**Estado:** fluxo local completo; ativação externa pendente de conta e domínio.

## Contexto

O cabeçalho demonstrativo de tenant é útil no desenvolvimento, mas não pode determinar a empresa em produção. A identidade precisa ser verificável e vinculada à associação registrada no banco, sem introduzir microserviços prematuros.

## Decisão

- Produção recusa o tenant demonstrativo e exige token Bearer assinado pelo Cognito.
- A API valida RS256 pelo JWKS do User Pool, emissor, expiração, cliente, tipo de token e `custom:tenant_id`.
- O web oferece entrada própria em três momentos e usa `USER_PASSWORD_AUTH` no servidor; senha nunca é armazenada ou escrita em cookie.
- O ambiente local pode habilitar um provedor de desenvolvimento por variáveis ignoradas pelo repositório. Ele usa senha derivada com scrypt, TOTP compatível com Authenticator e sessão de desafio assinada por cinco minutos; esse provedor não substitui o Cognito em homologação ou produção.
- Quando o Cognito devolve `SOFTWARE_TOKEN_MFA`, a sessão opaca do desafio fica por cinco minutos em cookie HttpOnly/SameSite e o código TOTP é respondido ao Cognito.
- A criação de conta acontece na interface do Zucchero com nome da proprietária, nome da confeitaria, e-mail e senha; o Cognito envia e valida o código de confirmação do e-mail.
- O servidor gera `custom:tenant_id`; o navegador nunca escolhe esse UUID. `custom:tenant_name` preserva o nome necessário para o primeiro bootstrap.
- No primeiro token válido sem associação existente, a API só cria o espaço quando o UUID ainda não existe. Uma função transacional com privilégio restrito insere tenant, proprietária, associação e configurações; um UUID já ocupado é recusado para impedir apropriação de outro tenant.
- A autenticação hospedada por Authorization Code com PKCE permanece como caminho de recuperação, primeiro acesso e desafios ainda não tratados pela interface própria.
- O ID token fica somente em cookie HttpOnly/SameSite e é encaminhado à API pelo servidor.
- Rotas protegidas redirecionam para o Hosted UI somente quando `AUTH_REQUIRED=true`; o ambiente demonstrativo continua independente de credenciais externas.
- Depois do bootstrap, todo acesso confirma `sub → membership → tenant` sob RLS antes de atender o módulo.
- O cache de chaves tem duração limitada e nunca transforma claims não verificadas em contexto.
- A fundação CloudFormation versiona User Pool/client, ECR, bucket privado, segredo do banco, cluster ECS e logs.
- RDS, Redis, ALB, DNS, certificado e serviços Fargate serão aplicados apenas com credenciais, domínio e decisões de custo da conta real.

## Consequências

O monolito possui o fluxo completo para identidade gerenciada e publicação reproduzível sem fingir que uma homologação externa foi implantada. A aplicação da stack e a prova contra um User Pool real continuam dependentes da configuração AWS.
