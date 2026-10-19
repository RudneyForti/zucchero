# Zucchero — sistema visual aprovado

**Estado:** fonte de verdade visual do MVP  
**Referência navegável:** `../../confeitaria-bancada-fluxo.html`  
**Direção:** bancada artesanal, acolhedora e precisa; nunca um ERP genérico.

## Arquitetura de marca

- **Zucchero** é a marca do aplicativo e aparece no acesso, metadados, instalação PWA e navegação;
- o logotipo horizontal oficial é usado nas superfícies de marca; o monograma quadrado oficial é reservado a favicon, ícone instalado e espaços realmente compactos;
- na entrada, a assinatura “feito à mão, com método” ocupa uma linha própria logo abaixo do logotipo e se alinha ao início do lettering;
- o nome e a identidade visual da confeitaria pertencem ao tenant e aparecem como contexto da cozinha autenticada;
- “bancada” continua sendo a metáfora do espaço de produção, nunca o nome do produto;

## Princípios

1. A interface deve parecer um espaço de trabalho cuidado, não uma coleção de widgets.
2. Porcelana, papel, tecido e tinta inspiram as superfícies sem simular materiais de forma literal.
3. A hierarquia vem de tipografia, respiro e agrupamento; sombras são leves e raras.
4. Ações têm linguagem humana e explicam o resultado esperado.
5. O produto final é a unidade visual da produção; seus momentos aparecem numa única trilha.
6. Movimento comunica continuidade e resposta. Nenhuma animação é obrigatória para compreender a tela.

## Cores

| Papel | Valor | Uso |
|---|---:|---|
| Porcelana | `#f8f3ea` | fundo e área de trabalho |
| Superfície | `#fffaf4` | cartões, navegação e formulários |
| Rosa suave | `#f6e7e8` | seleção e superfícies delicadas |
| Tinta | `#263446` | texto principal |
| Azul profundo | `#17385d` | títulos e hierarquia editorial |
| Vinho | `#71384a` | ações primárias, progresso e lettering da marca |
| Framboesa | `#963c59` | hover e destaque secundário |
| Rosa renda | `#edcdd4` | contornos e acentos |
| Sálvia | `#dfe8d9` | sucesso e conclusão |
| Sálvia escura | `#345443` | texto de sucesso |
| Cacau | `#59463e` | lembretes e notas |
| Texto suave | `#685a58` | texto secundário |
| Linha | `#dfd1c7` | divisores e bordas |
| Mel | `#a96327` | atenção |
| Papel de recado | `#f3e4d1` | post-it e avisos |
| Perigo | `#a13e4d` | erro e ação destrutiva |

Contraste mínimo: 4.5:1 para texto normal. Estado nunca é comunicado apenas pela cor.

## Tipografia

- títulos: **Newsreader Variable**, peso 500, com ritmo editorial;
- interface e leitura: **Manrope Variable**, pesos 400 e 500;
- corpo: mínimo de 16 px nas áreas de leitura e formulários;
- legendas podem chegar a 12 px quando não contêm informação essencial isolada;
- títulos usam `text-wrap: balance` e não são forçados a uma linha.

## Forma e profundidade

- janela principal: raio de 30 px;
- navegação suspensa: raio de 27 px;
- cartões principais: canto inicial mais contido e demais cantos entre 24 e 30 px;
- botões de ação: formato cápsula, altura mínima de 48 px;
- alvos de toque: mínimo de 44 × 44 px;
- sombras usam matiz de cacau/vinho e opacidade baixa;
- o padrão de fundo combina grade fina, pontos espaçados e manchas orgânicas suaves.

## Ritmo de espaçamento

- escala-base: 4, 8, 12, 16, 24, 32 e 48 px;
- páginas e seções sempre reservam espaço acima do primeiro título; margens negativas não corrigem alinhamento;
- linhas divisórias pertencem à seção anterior e o próximo título começa depois de pelo menos 12 px;
- conteúdos que sucedem um cabeçalho com divisor começam depois de 16 px; a borda nunca toca o cartão seguinte;
- campos relacionados usam 16 ou 18 px de intervalo; grupos maiores usam 24 ou 32 px.

## Componentes essenciais

### Navegação

- aside suspenso no desktop, com perfurações de papel na borda interna;
- navegação inferior com até cinco destinos no celular;
- item atual combina cor, superfície e `aria-current`;
- páginas internas exibem “Voltar” acima do cabeçalho editorial; a ação usa o histórico interno para preservar contexto e retorna a Hoje quando não existe uma página anterior válida;
- itens ainda não implementados permanecem inequivocamente indisponíveis.

### Entrada

- a entrada apresenta a bancada como um espaço de trabalho acolhedor, não como uma tela corporativa de autenticação;
- no desktop, narrativa e acesso ocupam duas partes da mesma janela de porcelana; no celular, somente marca, contexto essencial e ação permanecem;
- a senha é coletada somente no formulário de entrada, enviada ao Cognito pelo servidor e nunca persistida em estado durável, logs ou cookies;
- o acesso protegido avança por revelação progressiva: e-mail, senha e código TOTP somente quando o Cognito exigir MFA;
- a entrada não exibe uma contagem fixa de etapas, porque a confirmação TOTP é condicional; um filete ornamental preserva a separação visual sem prometer uma jornada de tamanho conhecido;
- a mesma janela oferece criação de conta sem misturar cadastro e entrada: identificação da proprietária e da confeitaria, senha e confirmação do e-mail são reveladas progressivamente;
- o cadastro também evita uma barra de etapas rígida; títulos e ações dizem claramente o que acontece agora e permitem voltar sem perder os dados de identificação;
- entre identificação e senha, o cadastro oferece um perfil leve da confeitaria: imagem e endereço são opcionais, podem ser pulados juntos e permanecem editáveis em Ajustes;
- a imagem aceita PNG, JPG ou WebP de até 512 KB, mostra prévia antes de salvar e nunca substitui a marca Zucchero na navegação;
- requisitos de senha respondem enquanto a pessoa digita, a confirmação usa `autocomplete="one-time-code"` e o reenvio permanece uma ação textual secundária;
- cada conta nova recebe um UUID de tenant imutável no Cognito e a primeira sessão cria confeitaria, proprietária, associação e preferências padrão numa única transação;
- no piloto Docker, o cadastro cria imediatamente a confeitaria, a proprietária e o vínculo no PostgreSQL; uma mensagem humana conduz ao login sem fingir que houve envio de e-mail;
- a identidade local é uma adaptação temporária do piloto: senha nunca é persistida em texto, sessão fica em cookie HttpOnly e o tenant vem da identidade assinada, não de uma escolha da interface;
- a etapa atual recebe foco sem esconder o título, permite voltar e preserva o e-mail enquanto senha e código nunca são persistidos no navegador;
- o campo de senha permite revelar o conteúdo, aceita gerenciadores e colagem; o código usa teclado numérico e `autocomplete="one-time-code"`;
- “Meu perfil” mostra o estado do Authenticator sem expor linguagem técnica; a configuração abre em diálogo, oferece QR Code e chave manual e só é concluída depois de validar o primeiro código;
- o segundo fator é individual por conta, nunca por confeitaria; quando ativo, aparece somente depois de uma senha válida e sua desativação exige senha e código atual;
- o segredo TOTP aparece apenas durante a configuração, é cifrado antes de persistir e nunca integra notificações, logs ou respostas posteriores;
- o acionador de revelar senha muda apenas a cor no hover; seu contorno interno e discreto é reservado ao foco por teclado, sem competir com o foco da moldura do campo;
- o ambiente de demonstração oferece uma passagem explícita para a bancada e explica sua condição sem linguagem técnica;
- erro, proteção do acesso e separação entre confeitarias permanecem próximos à ação principal;
- o recado preso por fita pode antecipar o que espera a usuária, mas não compete com a decisão de entrar.

### Barra superior

- vidro translúcido com blur discreto;
- barreira visual por linha em gradiente e sombra quase imperceptível;
- a barra não captura cliques fora de seus controles;
- o acionador de perfil permanece centralizado verticalmente na altura do vidro;
- o perfil abre uma pequena superfície de porcelana translúcida com identidade, configuração e saída visualmente separada;
- o menu fecha por `Esc`, clique externo ou escolha de uma opção, e devolve o foco ao acionador quando fechado pelo teclado;
- “Configuração de perfil” abre Ajustes desde o início da página; quando acionada novamente dentro de Ajustes, devolve a rolagem interna ao topo sem recarregar a tela;
- o trilho de rolagem percorre toda a borda interna curva da janela.

### Continuidade entre telas

- a navegação preserva a tela atual enquanto a próxima rota reúne seus dados e só então realiza a troca completa;
- fallbacks de rota não substituem a bancada por skeletons ou mensagens soltas de curta duração;
- estados de carregamento continuam permitidos dentro de ações e superfícies específicas quando a espera é perceptível, sem desmontar a moldura principal.

### Superfícies arredondadas com rolagem

- toda superfície arredondada e rolável usa duas camadas: o casco recorta a forma e o filho controla a rolagem;
- o casco aplica `overflow`, contenção de pintura e `clip-path` com exatamente o mesmo raio visual da superfície;
- a sombra pertence à camada externa e nunca é sacrificada pelo recorte da scrollbar;
- setas nativas permanecem ocultas; trilho e cursor usam os mesmos tokens vinho/rosa da aplicação;
- mudanças responsivas de raio atualizam também o raio de recorte;
- o padrão reutilizável é `rounded-scroll-shell` + `rounded-scroll-area`, inclusive em diálogos e listas suspensas.
- todo diálogo usa um cabeçalho fixo sobreposto ao início da área rolável, com título funcional, fechamento no mesmo plano e o vidro translúcido da barra superior;
- a área rolável ocupa toda a altura do casco e recebe espaço inicial equivalente ao cabeçalho; ao rolar, o conteúdo passa atrás do vidro como na página principal;
- a difusão, a linha de borda e a sombra desse cabeçalho usam os tokens globais de vidro; `scroll-padding` preserva o foco abaixo da faixa e o título funcional não é duplicado;
- o nome funcional do diálogo aparece somente na barra de vidro; o conteúdo pode manter uma chamada editorial complementar, mas nunca repete o nome ou a contagem de etapa;
- a primeira etapa de um fluxo não exibe “Voltar”; fechar ou cancelar encerra o diálogo. A partir da segunda etapa, “Voltar” retorna somente à etapa anterior e preserva os dados já preenchidos;

### Cartões de produção

- um cartão representa o produto final do pedido;
- preparação intermediária aparece como etapa atual dentro do cartão;
- trilha de círculos fica no rodapé do cartão;
- pedidos seguintes aparecem abaixo, sem repetir as etapas da trilha.

### Hoje

- a página inicial funciona como um painel de decisão da cozinha, nunca como uma grade genérica de indicadores;
- “Agora na bancada” permanece como a informação dominante e responde o que precisa das mãos da usuária neste momento;
- “Pede atenção hoje” reúne no máximo três alertas acionáveis de estoque mínimo, validade ou bloqueio de produção; a leitura completa continua na Despensa;
- “Saem hoje” ordena entregas e retiradas por horário, enquanto “Depois na bancada” preserva a sequência dos próximos preparos;
- o resumo financeiro usa o nome “Movimento de hoje”, evitando a ambiguidade entre receita culinária e receita financeira;
- o movimento financeiro aparece somente para proprietárias e perfis com acesso financeiro; valores nunca vazam para o perfil operacional;
- percentuais comparativos decorativos cedem lugar a informações que orientam uma decisão, como horário, quantidade de encomendas, recebido e a receber;
- no celular, a ordem de leitura é bancada atual, atenção, saídas, movimento financeiro, próximos preparos e recado;
- estados vazios ocupam pouco espaço e deixam a próxima ação explícita, sem grandes cartões sem conteúdo.

### Lembrete

- formato de papel preso por fita;
- rotação máxima de 0,6 grau;
- conteúdo curto, acionável e sem tom alarmista.

### Notificações do sistema

- ficam fixas no canto inferior direito da janela, sem acompanhar a rolagem;
- novas mensagens formam uma pilha que cresce para cima, limitada a três itens;
- desaparecem após cinco segundos e sempre oferecem fechamento manual;
- no celular, permanecem alinhadas à direita e acima da navegação inferior;
- avisos não críticos usam anúncio educado para tecnologias assistivas;
- ações críticas ou que exigem decisão nunca dependem apenas de uma notificação temporária.

### Despensa

- a prateleira segue **categoria → ingrediente da receita → produto comprado → lote**; no domínio interno, ingrediente e produto comprado continuam sendo o grupo culinário e a apresentação comercial;
- cada categoria ocupa uma única superfície principal e reúne todos os ingredientes pertencentes a ela; a categoria nunca é repetida como legenda de vários cartões individuais;
- dentro da categoria, ingredientes são linhas expansíveis com saldo próprio; marca, embalagem, apresentação comercial e lotes aparecem somente no nível subordinado;
- o resumo da categoria usa contagens de ingredientes, produtos e lotes, sem somar pesos ou unidades incompatíveis; disponibilidade continua sendo informada no ingrediente e no produto;
- formulários perguntam “Como esse produto aparece nas suas receitas?” e nunca expõem o termo técnico “grupo culinário” à usuária;
- disponibilidade é mostrada em linguagem direta e a validade mais próxima acompanha o item;
- entrada manual acontece em um diálogo amplo sobre a despensa, preservando o contexto da prateleira;
- o diálogo usa três blocos curtos: produto, quantidade/custo e origem do lote;
- o casco do diálogo permanece fixo e recorta a rolagem interna dentro de suas curvas; a página ao fundo permanece imóvel;
- a faixa rosa lateral pertence ao casco do diálogo e percorre toda a altura, sem acompanhar a rolagem;
- títulos de cada bloco mantêm respiro superior depois das linhas divisórias;
- `Esc`, clique no fundo, botão de fechar e “Cancelar” encerram a tarefa; o foco retorna à ação que a abriu;
- no celular, o diálogo ocupa quase toda a viewport sem perder cantos, respiro ou alvos de 44 px;
- cadastro de um novo produto comprado é revelado somente quando o item conhecido não atende;
- possível duplicidade interrompe a criação com tom colaborativo e oferece usar o existente ou criar mesmo assim;
- alertas de validade e mínimo parecem lembretes de bancada, não alarmes de sistema.
- a prateleira oferece busca textual e filtro pesquisável por categoria sem virar uma barra densa de filtros;
- categorias são famílias amplas; seu gerenciamento completo acontece em diálogo próprio e a entrada manual permite selecionar ou criar uma família sem abandonar a compra;
- durante o cadastro de um novo produto comprado, a busca de categoria oferece criação contextual quando não há correspondência exata; a nova família é validada, salva e selecionada sem fechar a compra;
- categorias semelhantes permanecem visíveis antes da criação para reduzir duplicidades, e o fluxo reforça que marca, produto e embalagem não são categorias;
- cada lote revela físico, reservado e livre antes de oferecer conferência ou perda;
- a contagem pergunta “quanto existe de verdade” e explica que somente a diferença será registrada;
- perda usa linguagem direta, ação em cor de perigo e uma segunda confirmação antes da baixa;
- a lista de compras reúne faltas por produto comprado, escreve quantidade e prazo e leva à entrada manual já preenchida;
- NFC-e é uma jornada assistida em diálogo: captura, revisão por linha e confirmação final;
- câmera, URL e chave são portas equivalentes; indisponibilidade da câmera nunca bloqueia a tarefa;
- cada sugestão fiscal explica que marca e embalagem precisam ser conferidas;
- a etapa de revisão sempre começa no topo e mantém o título visível antes das linhas;
- documento repetido é explicado como proteção da despensa, não como erro técnico;

### Receitas

- a página assume a linguagem de um caderno de trabalho, não de uma ficha técnica de ERP;
- “Importar por link” é uma ação vizinha, mas visualmente secundária a “Nova receita”; ela abre uma prévia antes de qualquer alteração no caderno ou na despensa;
- a prévia explica o que foi reconhecido, o que será reutilizado ou criado e quais medidas dependem da primeira execução; automação nunca é apresentada como certeza silenciosa;
- a confirmação cria somente um rascunho e preserva fonte, autoria e URL na ficha da versão;
- o cartão representa a receita-base reutilizável; cliente, ocasião e personalização aparecem somente na encomenda;
- o cartão inteiro abre uma ficha em diálogo com rendimento, custo, composição e etapas, sem depender de um ícone escondido;
- rascunhos oferecem edição direta; receitas publicadas oferecem criação de nova versão previamente preenchida;
- a linguagem da interface deixa explícito que versões já usadas por pedidos permanecem intactas;
- cada cartão resume uma versão com rendimento, custo conhecido, tempo e quantidade de ingredientes;
- os momentos aparecem como uma trilha linear de círculos e antecipam a mesma leitura usada na produção;
- o cadastro acontece em diálogo e segue três blocos progressivos: essência, composição e momentos/etapas;
- o ingrediente culinário vem antes da marca; produtos comprados aparecem apenas quando a regra é preferencial ou obrigatória;
- ingredientes e momentos são listas dinâmicas, mas cada linha mantém título, separador e ação de remoção inequívocos;
- custo, rendimento e tempo permanecem juntos numa prévia de bancada antes de salvar;
- rascunho e publicação são ações separadas e nomeiam claramente o efeito no sistema.
- a ficha oferece simulação proporcional de rendimento, custo, porções e ingredientes sem alterar a versão;
- resultados derivados aparecem junto ao campo que os controla e atualizam sem exigir uma ação de confirmação;

### Pedidos

- “Pedidos” nomeia o módulo e seus registros; “Nova encomenda” é o rótulo único da ação de criação em toda a aplicação;
- acionadores fora do módulo usam `/pedidos?acao=nova-encomenda`, abrindo o mesmo diálogo automaticamente em um único clique e preservando o estado na URL enquanto ele estiver aberto;
- a página nunca presume dados de demonstração: sem cliente ou receita publicada, exibe um início guiado com as duas bases necessárias e permanece acessível, sem erro de renderização;
- “Nova encomenda” só aparece quando existe ao menos uma cliente e uma receita publicada; cada pendência aponta diretamente para o cadastro correspondente e perfis sem acesso operacional apenas acompanham o estado;
- a criação segue quatro passos humanos: cliente, encomenda, disponibilidade e preço;
- somente o passo atual revela seus campos; a trilha de círculos permanece visível como orientação e permite retornar ao que já foi preenchido;
- o item nomeia a receita-base e exibe a versão preservada, mantendo cliente e ocasião na encomenda;
- peso solicitado, produção arredondada, fator e sobra técnica aparecem juntos antes da disponibilidade;
- no item da encomenda, peso, data e horário formam uma coluna de compromisso; a observação ocupa a coluna vizinha com a mesma altura visual e empilha somente quando o próprio card perde espaço;
- em entregas, a pessoa escolhe um endereço cadastrado da cliente e recebe no próprio passo a distância rodoviária, o tempo estimado e o custo calculado por Google Maps; estados de cálculo, falha e nova tentativa ocupam a mesma superfície para não deslocar o formulário;
- no desktop, tipo e endereço de entrega ocupam um terço da largura útil enquanto resumo e mapa compartilham uma única superfície nos dois terços restantes; essa superfície alinha topo e base à coluna de controles, deixando somente o mapa absorver a diferença de altura; em larguras menores, os grupos empilham na ordem do preenchimento e o mapa recupera sua proporção natural;
- ao escolher entrega, a responsabilidade é explícita: própria calcula rota e custo por quilômetro, terceirizada é combinada e paga diretamente pela cliente sem compor o pedido, e plataforma integrada só pode ser escolhida quando um parceiro real estiver conectado;
- disponibilidade é uma leitura explicada por ingrediente: quanto precisa, quanto existe, o que pode substituir e quantas embalagens comprar;
- a margem dirige o preço; custo, entrega, lucro e markup aparecem como explicação próxima, sem criar um painel financeiro denso;
- o custo de entrega é a distância de ida multiplicada pela tarifa vigente por quilômetro, fica separado de embalagem e outros custos na interface e é incorporado ao custo total antes da margem;
- confirmar devolve a pessoa à lista e coloca o novo compromisso no início, com notificação discreta no canto inferior direito;
- o resultado aparece dentro do detalhe como um fechamento de bancada, não como painel de indicadores: comparação precisa entre previsto e realizado, seguida de valor, lucro e margem;
- barras comparativas sempre mantêm rótulos e valores exatos; cor apenas reforça uma diferença que também está escrita;
- apontamentos incompletos mostram custo conhecido e preservam lucro/margem como previstos; nunca simulam um fechamento realizado;

### Clientes

- a página usa a linguagem de um caderno de relações, com busca única e cartões inteiros clicáveis;
- nome e telefone formam o cadastro mínimo; dados opcionais são revelados no mesmo fluxo sem transformar o atendimento numa ficha burocrática;
- o diálogo segue três blocos progressivos: reconhecimento, entrega e pequenos combinados;
- cada cartão privilegia nome, telefone, endereço principal e preferência habitual, sem uma grade de métricas;
- possível telefone repetido interrompe a criação com linguagem colaborativa e oferece abrir a pessoa já cadastrada;
- endereços são opcionais, recebem nomes humanos como Casa ou Trabalho e deixam inequívoco qual é o principal;
- cada endereço começa pelo CEP; ao completar oito dígitos, a consulta preenche logradouro, bairro, cidade e UF, preserva número e complemento já digitados e mantém todos os campos editáveis;
- carregamento e sucesso da busca de CEP são anunciados sem deslocar o formulário; apenas a falha ocupa espaço, explica a recuperação e nunca impede o preenchimento manual;
- CEP, logradouro, número, complemento, bairro, cidade e UF são persistidos separadamente, enquanto uma versão legível é composta para cartões, pedidos e busca;
- preferências preenchem o próximo pedido, mas continuam editáveis naquela encomenda;
- o diálogo sempre abre no topo; foco automático nunca pode ocultar o título em telas pequenas;
- notas pedem apenas contexto de atendimento e lembram explicitamente que dados sensíveis não pertencem ao cadastro;

### Equipamentos

- a página trata máquinas e ferramentas como companheiras da produção, sem linguagem de patrimônio contábil;
- o resumo começa pela condição da cozinha e contextualiza aquisição e manutenção em uma frase, sem grade de KPIs;
- cada cartão combina identidade, estado, valor conhecido, pedidos apoiados, usos e próximo cuidado;
- a coleção usa grade fluida de três cartões no desktop, dois no tablet e um no celular; cada cartão reorganiza seus indicadores verticalmente para preservar legibilidade sem rolagem horizontal;
- receita aparece sempre como “receita dos pedidos apoiados” e traz perto a advertência de que não é lucro nem valor aditivo entre equipamentos;
- cadastro, manutenção e participação na produção usam diálogos curtos com revelação progressiva;
- históricos permanecem recolhidos até serem solicitados, expandem dentro do próprio cartão sem cobrir os vizinhos e preservam leitura cronológica humana;
- indisponibilidade é uma ação explícita e reversível; equipamentos baixados preservam o histórico;
- a etapa da receita pede um tipo de equipamento, enquanto a bancada apresenta o ativo concreto reservado para aquela execução;
- a condição do equipamento aparece dentro do card da tarefa em uma faixa discreta; aviso orienta e bloqueio explica como resolver, com `role="alert"` somente quando impede a ação;
- concluir a tarefa registra o uso automaticamente, sem pedir à proprietária que repita um dado que a própria bancada já conhece;

### Financeiro

- a leitura começa por uma frase de caixa e só então revela composição, comparação e contas;
- o período alterna entre mês e ano; a visão anual percorre os doze meses e cada mês conduz à sua leitura detalhada;
- o gráfico de composição usa somente caixa efetivo: entradas por forma de recebimento e gastos por categoria paga, incluindo taxas dos recebimentos como gasto próprio;
- barras são apoio visual e permanecem acompanhadas por categoria, valor, percentual e quantidade de movimentos;
- previsto e em aberto nunca são misturados ao gráfico de movimentos efetivos;
- comparação mensal escreve valor atual, anterior e diferença; cor e direção visual nunca substituem o texto;
- categorias são ordenadas pelo valor previsto e usam barras horizontais apenas como apoio, sempre acompanhadas por valores exatos;
- comparação e categorias formam cartões editoriais, não uma grade de KPIs ou um dashboard contábil;
- exportar o mês é ação secundária e gera CSV em formato brasileiro, enquanto registrar despesa permanece a decisão principal;
- no celular, as leituras empilham e mantêm rótulos, valores e ações sem rolagem horizontal;

### Controles de formulário

- selects visuais usam o combobox próprio da aplicação; o `select` nativo não aparece na camada de interface;
- listas extensas são digitáveis, filtram sem diferenciar acentos e preservam a opção de cadastrar um novo item;
- o combobox oferece setas, `Enter` e `Esc`, mantém foco visível e envia um valor explícito no formulário;
- datas podem ser digitadas em `dd/mm/aaaa` ou escolhidas no calendário próprio em português;
- o calendário abre para o lado com mais espaço, usa ícones da família Lucide e preserva navegação por teclado;
- o calendário é compacto o bastante para permanecer inteiro dentro de diálogos e regiões roláveis, sem tocar ou ser cortado pela moldura;
- horários usam o seletor próprio em formato de 24 horas, aceitam digitação `hh:mm` e nunca expõem o painel AM/PM nativo do navegador;
- campos numéricos escondem os spinners nativos e usam setas próprias, mantendo `min`, `max` e `step` do campo;
- em controles compostos, somente a moldura externa desenha fundo, borda, raio e foco; o `input` interno permanece neutro em qualquer contexto de formulário;
- controles compostos ocupam no máximo a largura disponível, permitem encolhimento interno e nunca invadem a coluna vizinha;
- campos lado a lado pertencem a uma mesma linha visual; seus controles compartilham a base mesmo quando um dos rótulos ocupa mais linhas;
- textos longos usam área multilinha de altura fixa, sem redimensionamento por arraste, com rolagem interna e contador discreto de caracteres;
- telefones brasileiros assumem máscara com DDD durante digitação ou colagem, diferenciando celular e fixo sem exigir que a pessoa insira pontuação;
- controles têm altura mínima de 48 px, rótulos persistentes e o mesmo anel de foco vinho/rosa;
- menus e calendários herdam porcelana, tinta, bordas e sombras do sistema, sem cinza nativo do navegador.

### Ajustes

- a página fala em combinados da cozinha, não em parâmetros administrativos;
- identidade da confeitaria, preferências de venda, perfil pessoal e horários são blocos independentes, cada um com contexto e salvamento próprio;
- no desktop, a coluna da direita é composta por dois cartões — combinados de venda e Meu Perfil — em vez de esticar um único cartão para acompanhar a identidade da confeitaria;
- a imagem e o nome pessoais nunca substituem silenciosamente a imagem e o nome da confeitaria; o cabeçalho usa o perfil, enquanto a navegação e os documentos continuam usando a marca do negócio;
- o e-mail de acesso aparece no perfil como referência somente leitura, pois a troca de identidade exige um fluxo próprio de segurança;
- ao completar oito dígitos de CEP, cadastro e Ajustes consultam o endereço, preenchem logradouro, bairro, cidade e UF e mantêm todos os campos editáveis;
- a consulta de CEP não reserva uma linha de ajuda permanente: carregamento e sucesso são anunciados sem alterar o layout, enquanto apenas a falha aparece junto ao campo e nunca bloqueia o preenchimento manual;
- o preenchimento assíncrono do CEP nunca apaga número ou complemento que a pessoa já tenha digitado enquanto a consulta estava em andamento;
- o endereço da confeitaria preserva logradouro, número, complemento, bairro, cidade e UF separadamente; número aceita valores como “s/n” e “128-A”;
- a indicação de ponto comercial é uma escolha explícita e contextualizada como apoio futuro ao planejamento de retiradas, sem prometer uma automação ainda inexistente;
- “Pessoas e acessos” trata membros como pessoas da bancada, nunca como uma grade administrativa densa;
- a proprietária Full permanece inequívoca e imutável; funcionárias usam uma única droplist de perfil com Operacional, Financeiro ou Operacional + Financeiro, evitando combinações inválidas e ruído visual;
- o convite é progressivo, expõe o link bruto uma única vez e explica que a pessoa entrará na confeitaria existente;
- pendências mostram e-mail, escopo, validade e cancelamento sem esconder ações em menus;
- Meu Perfil pertence a qualquer conta e mantém a exclusão em uma zona separada, com senha, nome literal da confeitaria e confirmação de irreversibilidade;
- se a única proprietária excluir a conta, a interface declara com clareza que toda a confeitaria ficará irrecuperável pelo aplicativo;
- presets deixam claro que preenchem a nova encomenda, mas nunca impedem uma exceção naquele combinado;
- os combinados de venda incluem uma tarifa por quilômetro para entrega; valor zero preserva entregas sem cobrança automática, enquanto uma tarifa positiva exige uma rota válida antes de confirmar a encomenda;
- preferências da cliente têm precedência visível sobre pagamento e entrega habituais da confeitaria;
- horários usam uma linha por dia, com disponibilidade e intervalo; no celular, o dia ocupa uma linha e os horários ficam lado a lado;
- dados pessoais exibem orientação de minimização próxima ao salvamento;

## Movimento

- transições entre 160 e 280 ms;
- entrada de tela suave, sem coreografia excessiva;
- hover não altera dimensões nem desloca o layout;
- ações assíncronas mostram progresso;
- `prefers-reduced-motion: reduce` remove movimento não essencial.

## Responsividade

- sem rolagem horizontal a partir de 320 px;
- desktop: aside, barra superior e conteúdo em duas colunas quando houver espaço;
- tablet: conteúdo reduz para uma coluna antes de ficar comprimido;
- celular: aside vira navegação inferior e ações largas podem ocupar a linha;
- conteúdo rola dentro da janela curva, não no documento.
- cada região rolável herda e recorta o próprio raio; barras e controles nativos nunca ultrapassam a curva externa.

## Acessibilidade e qualidade

- foco visível com anel vinho/rosa e deslocamento suficiente;
- link “Pular para o conteúdo”;
- ícones SVG de uma única família, com nome acessível nos botões de ícone;
- formulários com rótulo persistente, ajuda e erro junto ao campo;
- espaço reservado para conteúdo dinâmico, evitando layout shift;
- nenhuma dependência de hover para descobrir uma ação;
- estados vazio, carregando, erro, sucesso e repetição são obrigatórios.

## Evitar

- cards de métricas em grade como primeira linguagem da tela;
- gradientes roxo/azul associados a produtos genéricos de IA;
- excesso de pílulas, badges, glow ou vidro;
- emojis como ícones;
- cinza corporativo dominante;
- tabelas densas para tarefas cotidianas;
- animação decorativa contínua;
- temas escuros como padrão do MVP.
