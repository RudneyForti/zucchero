# Homologação AWS

A fundação versionada cria Cognito, cliente OAuth por código, atributo imutável `tenant_id`, ECR para web/API, bucket privado e versionado, segredo do banco, cluster ECS e grupos de logs. Ela não publica recursos pagos sem a conta e os parâmetros da empresa.

## Aplicar a fundação

```bash
aws cloudformation deploy \
  --region sa-east-1 \
  --stack-name bancada-homolog-foundation \
  --template-file infra/aws/homologation-foundation.yaml \
  --parameter-overrides \
    EnvironmentName=homolog \
    CognitoDomainPrefix=PREFIXO-UNICO \
    WebCallbackUrl=https://SEU-DOMINIO/auth/callback \
    WebLogoutUrl=https://SEU-DOMINIO/
```

Contas criadas pela interface recebem o mesmo UUID nos dois lados automaticamente:

1. atributo Cognito `custom:tenant_id`;
2. `app_users.external_subject` e `memberships.tenant_id` no bootstrap transacional do primeiro acesso.

O UUID é gerado no servidor web e gravado como atributo imutável. A função de bootstrap recusa UUID já existente, cria confeitaria, proprietária, associação e configurações numa única transação e então devolve o controle normal ao RLS.

A API em `NODE_ENV=production` ignora `x-demo-tenant-id`, valida assinatura RS256 no JWKS do User Pool, emissor, expiração, cliente e tenant, e confirma a associação no PostgreSQL com RLS antes de abrir qualquer módulo.

No serviço web, configure também:

```text
AUTH_REQUIRED=true
WEB_PUBLIC_URL=https://SEU-DOMINIO
AWS_REGION=sa-east-1
COGNITO_DOMAIN=https://PREFIXO-UNICO.auth.sa-east-1.amazoncognito.com
COGNITO_CLIENT_ID=<saída UserPoolClientId>
```

O web inicia Authorization Code com PKCE, valida o retorno e mantém o ID token em cookie HttpOnly. O valor de `WEB_PUBLIC_URL` deve coincidir exatamente com as URLs de callback e logout da stack.

A entrada principal usa e-mail e senha pelo fluxo `ALLOW_USER_PASSWORD_AUTH`. Se a usuária tiver TOTP configurado, o Cognito devolve o desafio `SOFTWARE_TOKEN_MFA` e a terceira etapa solicita o código do aplicativo autenticador. A página hospedada continua disponível para recuperação de senha, primeiro acesso e configuração inicial do fator.

Para ensaios exclusivamente locais, `LOCAL_AUTH_ENABLED=true` habilita uma identidade de desenvolvimento configurada no `.env` ignorado pelo repositório. A senha permanece somente como derivação scrypt e o segredo TOTP não deve ser reutilizado fora da máquina local.

## Publicação que ainda exige a conta

- escolher VPC/sub-redes privadas e custo do NAT;
- criar RDS PostgreSQL e ElastiCache Redis nos grupos privados;
- publicar as imagens nos dois repositórios ECR;
- criar task definitions e serviços Fargate para migrate, API e web;
- configurar ALB, certificado ACM, DNS e health checks;
- fornecer URLs/segredos somente via Secrets Manager/Parameter Store;
- executar restore de backup e teste adversarial entre tenants em homologação.

Esses itens alteram infraestrutura cobrada e dependem de credenciais, domínio e limites da conta; por isso não são executados automaticamente pelo workspace local.
