# ADR 0039 — Pessoas, grupos de acesso e exclusão da conta

## Contexto

O piloto deixou de ser exclusivamente unipessoal. A proprietária precisa dividir a operação sem expor o Financeiro, enquanto uma pessoa financeira precisa consultar pedidos sem alterar receitas, estoque ou produção. Uma conta criada como empresa por engano também não pode atravessar para outro tenant silenciosamente.

## Decisão

- `membership_role` distingue `owner` e `employee`; proprietária implica acesso Full.
- Funcionárias recebem `operational_access` e/ou `financial_access`.
- Operacional cobre Hoje, pedidos operacionais, receitas, produção, clientes, despensa, NFC-e e equipamentos.
- Financeiro cobre o módulo financeiro, recebimentos/despesas e leitura de pedidos.
- Configurações empresariais e gestão de pessoas exigem proprietária.
- A autorização é aplicada por guard da API e repetida na navegação apenas para reduzir ruído.
- Uma conta possui no máximo um `membership` no MVP.
- Convites guardam somente SHA-256 do token, expiram em sete dias e podem ser revogados.
- No Docker, o link é copiado manualmente; envio por e-mail fica para a infraestrutura futura.
- E-mail já vinculado não revela o tenant existente ao remetente e gera aviso pessoal na conta conflitante.
- A exclusão própria exige senha, nome literal do tenant e confirmação explícita. Funcionária remove sua conta; a única proprietária encerra também o tenant. Proprietária com equipe é bloqueada até tratar os demais acessos.
- Exclusão torna identidade e tenant irrecuperáveis pela aplicação. Dados históricos sujeitos a retenção permanecem inacessíveis, restritos e com identidade anonimizada.

## Consequências

- A matriz de acesso pode evoluir para permissões granulares sem trocar o isolamento por tenant.
- O MVP não implementa transferência de propriedade nem participação em múltiplas empresas.
- Tokens brutos de convite não podem ser recuperados; para gerar outro link é necessário revogar e convidar novamente.
- A migração para Cognito preservará `app_users`, `memberships` e tenants; apenas o adaptador de credencial e entrega do convite será substituído.
