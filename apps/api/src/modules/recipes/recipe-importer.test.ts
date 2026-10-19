import { describe, expect, it } from "vitest";
import { parseStructuredRecipeHtml } from "./recipe-importer";

const brownieHtml = `
  <html>
    <head>
      <meta property="og:site_name" content="Paola Carosella" />
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": "Brownie",
          "author": { "name": "Paola Carosella" },
          "yield": "12 unidades (aproximadamente)",
          "totalTime": "PT45M",
          "supply": [
            { "requiredQuantity": "170", "name": "gramas de manteiga sem sal" },
            { "requiredQuantity": "120", "name": "gramas de chocolate amargo 70%" },
            { "requiredQuantity": "3", "name": "ovos temperatura ambiente" },
            { "requiredQuantity": "1", "name": "colher de chá de café instantâneo" },
            { "requiredQuantity": "1", "name": "colher de café de sal fino" }
          ],
          "step": [
            { "text": "Pre aqueça o forno a 180 graus." },
            { "text": "Derreta a manteiga, desligue o fogo e acrescente o café e o chocolate." },
            { "text": "Misture os ovos e os demais ingredientes." },
            { "text": "Leve ao forno por 20 a 25 minutos." },
            { "text": "Retire, deixe esfriar e corte." }
          ]
        }
      </script>
    </head>
  </html>
`;

const paoDeLoHtml = `
  <html>
    <head>
      <meta property="og:site_name" content="Paola Carosella" />
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Recipe",
          "name": "Pão de ló",
          "author": { "name": "Paola Carosella" },
          "recipeYield": "10 a 12 fatias",
          "totalTime": "PT1H15M",
          "recipeIngredient": [
            "1 xícara de 225ml bem cheia ou 150 gramas + 2 colheres de sopa de farinha de trigo",
            "1 xícara de 225ml rasa ou 150 gramas de açúcar refinado",
            "5 ovos frescos",
            "1 colher de chá de essência de baunilha",
            "raspas de limão ou laranja opcional",
            "1 forma de 20cm para um pão de ló mais alto ou 24 cm para um pão de ló mais baixo de diâmetro"
          ],
          "recipeInstructions": [
            { "text": "Para essa receita use um forno de confiança, pois a precisão da temperatura é muito importante." },
            { "text": "Essa massa deve ser assada em temperatura baixa." },
            { "text": "Pré-aqueça o forno a 160 °C." },
            { "text": "Corte o papel manteiga para o fundo e unte a forma." },
            { "text": "Peneire a farinha duas vezes e reserve." },
            { "text": "Bata os ovos com o açúcar por aproximadamente 13 minutos." },
            { "text": "A mistura deve crescer e ficar clara e aerada. Adicione as raspas e a baunilha." },
            { "text": "Desligue a batedeira e incorpore a farinha lentamente." },
            { "text": "Adicione a farinha aos poucos, peneirando em 3 partes." },
            { "text": "Certifique-se que toda a farinha foi incorporada e não se formaram bolsas de farinha na massa." },
            { "text": "Transfira a massa para a forma untada e leve ao forno até assar." },
            { "text": "Para testar o ponto, pressione a superfície do bolo e sinta a textura de uma esponja." },
            { "text": "Para uma forma de 20 cm em forno a 160 °C o tempo de cozimento é de 55 minutos." },
            { "text": "Retire do forno e deixe esfriar completamente antes de desenformar." }
          ]
        }
      </script>
    </head>
    <body>
      <ul class="wprm-recipe-ingredients">
        <li class="wprm-recipe-ingredient"><span>1</span>&#32;<span>xícara de 225ml bem cheia ou 150 gramas + 2 colheres de sopa de farinha de trigo</span></li>
        <li class="wprm-recipe-ingredient"><span>1</span>&#32;<span>xícara de 225ml rasa ou 150 gramas de açúcar refinado</span></li>
        <li class="wprm-recipe-ingredient"><span>5</span>&#32;<span>ovos frescos</span>&#32;<span>60 gramas cada ovo em temperatura ambiente</span></li>
        <li class="wprm-recipe-ingredient"><span>1</span>&#32;<span>colher de chá de essência de baunilha</span></li>
        <li class="wprm-recipe-ingredient"><span>raspas de limão ou laranja opcional</span></li>
        <li class="wprm-recipe-ingredient"><span>1</span>&#32;<span>forma de 20cm para um pão de ló mais alto</span></li>
      </ul>
    </body>
  </html>
`;

const tiramisuHtml = `
  <html>
    <head>
      <meta property="og:site_name" content="Paola Carosella" />
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": "Tiramisù",
          "yield": "12 porções",
          "totalTime": "PT180M",
          "supply": [
            { "requiredQuantity": "1", "name": "litro de creme de leite fresco do tipo para bater chantilly, com 35% de gordura" },
            { "requiredQuantity": "1", "name": "colher de chá de açúcar" },
            { "requiredQuantity": "1", "name": "colher de chá de sal" },
            { "requiredQuantity": "¼", "name": "de colher de chá de ácido tartárico" },
            { "requiredQuantity": "5", "name": "ovos" },
            { "requiredQuantity": "150 g", "name": "de açúcar refinado" },
            { "requiredQuantity": "180 g", "name": "de farinha de trigo" },
            { "name": "Raspas de 1 laranja" },
            { "name": "Raspas de 1 limão" },
            { "requiredQuantity": "2", "name": "ovos" },
            { "requiredQuantity": "75 g", "name": "de açúcar" },
            { "requiredQuantity": "2", "name": "colheres de sopa de vinho marsala" },
            { "requiredQuantity": "1", "name": "colher de essência de baunilha" },
            { "requiredQuantity": "300 g", "name": "do mascarpone preparado de véspera" },
            { "requiredQuantity": "1 ½", "name": "xícara de chá de café forte" }
          ],
          "step": [
            {
              "@type": "HowToSection",
              "name": "Queijo mascarpone",
              "itemListElement": [
                { "text": "Coloque o creme de leite em uma panela com o açúcar e leve ao fogo até 80 ºC." },
                { "text": "Acrescente o sal e o ácido tartárico e misture." },
                { "text": "Despeje em vidro e deixe descansar na geladeira por 24 horas." }
              ]
            },
            {
              "@type": "HowToSection",
              "name": "Biscoito tipo champanhe ou pão-de-ló",
              "itemListElement": [
                { "text": "Bata os ovos com o açúcar e incorpore a farinha." },
                { "text": "Asse em forno preaquecido por 14 minutos a 170 ºC." }
              ]
            },
            {
              "@type": "HowToSection",
              "name": "Creme tiramisù",
              "itemListElement": [
                { "text": "Bata os ovos e o açúcar em banho-maria até 80 ºC." },
                { "text": "Misture o mascarpone ao zabaione e refrigere por 1 hora." }
              ]
            },
            {
              "@type": "HowToSection",
              "name": "Montagem do tiramisù",
              "itemListElement": [
                { "text": "Alterne creme e biscoitos embebidos no café e finalize com cacau." }
              ]
            }
          ]
        }
      </script>
    </head>
  </html>
`;

describe("parseStructuredRecipeHtml", () => {
  it("normalizes a structured recipe into the Zucchero draft model", () => {
    const result = parseStructuredRecipeHtml(
      brownieHtml,
      "https://paolacarosella.com.br/receitas/brownie/",
    );

    expect(result.name).toBe("Brownie");
    expect(result.yieldUnits).toBe(12);
    expect(result.totalDurationMinutes).toBe(45);
    expect(
      result.moments
        .flatMap((moment) => moment.steps)
        .reduce((total, step) => total + step.durationMinutes, 0),
    ).toBe(45);
    expect(result.source).toMatchObject({
      name: "Paola Carosella",
      author: "Paola Carosella",
      method: "structured_data",
    });
    expect(result.ingredients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Ovo",
          inputQuantity: 3,
          inputUnit: "unit",
          quantityG: 150,
          conversionConfidence: "inferred",
        }),
        expect.objectContaining({
          name: "Chocolate amargo 70%",
          quantityG: 120,
          conversionConfidence: "imported",
        }),
        expect.objectContaining({
          name: "Sal fino",
          quantityG: 2,
          conversionConfidence: "inferred",
        }),
      ]),
    );
    expect(result.moments.map((moment) => moment.name)).toEqual(
      expect.arrayContaining([
        "Preparação",
        "Base de chocolate",
        "Massa",
        "Forno",
        "Finalização",
      ]),
    );
    expect(result.dependencies).toHaveLength(5);
    expect(result.warnings.join(" ")).toContain("Rendimento em peso estimado");
  });

  it("rejects pages without culinary structured data", () => {
    expect(() =>
      parseStructuredRecipeHtml(
        "<html><title>Sem receita</title></html>",
        "https://example.com/page",
      ),
    ).toThrow("Não encontramos uma receita estruturada");
  });

  it("prioritizes declared gram alternatives and per-unit weights", () => {
    const result = parseStructuredRecipeHtml(
      paoDeLoHtml,
      "https://paolacarosella.com.br/receitas/pao-de-lo/",
    );

    expect(result.yieldMassG).toBe(560);
    expect(result.yieldUnits).toBe(10);
    expect(result.ingredients).toHaveLength(5);
    expect(result.ingredients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Farinha de trigo",
          inputQuantity: 150,
          inputUnit: "g",
          quantityG: 150,
          conversionConfidence: "imported",
        }),
        expect.objectContaining({
          name: "Açúcar refinado",
          inputQuantity: 150,
          inputUnit: "g",
          quantityG: 150,
          conversionConfidence: "imported",
        }),
        expect.objectContaining({
          name: "Ovo",
          inputQuantity: 5,
          inputUnit: "unit",
          conversionFactorToG: 60,
          quantityG: 300,
          conversionConfidence: "imported",
        }),
      ]),
    );
    expect(
      result.ingredients.some((ingredient) => /forma/i.test(ingredient.name)),
    ).toBe(false);
    expect(result.warnings.join(" ")).toContain(
      "foi reconhecido como utensílio",
    );
    expect(result.warnings.join(" ")).toContain(
      "rendimento de 10 a 12 unidades",
    );
    expect(result.moments.map((moment) => moment.name)).toEqual([
      "Mise en place",
      "Massa",
      "Preparação",
      "Forno",
      "Finalização",
    ]);
    const momentByName = new Map(
      result.moments.map((moment) => [moment.name, moment]),
    );
    expect(
      momentByName
        .get("Massa")!
        .steps.some((step) => /bolsas de farinha/i.test(step.instructions)),
    ).toBe(true);
    expect(
      momentByName
        .get("Preparação")!
        .steps.some((step) => /bolsas de farinha/i.test(step.instructions)),
    ).toBe(false);
    expect(
      momentByName
        .get("Forno")!
        .steps.some((step) => /testar o ponto/i.test(step.instructions)),
    ).toBe(true);
    expect(
      momentByName
        .get("Massa")!
        .steps.some((step) => /testar o ponto/i.test(step.instructions)),
    ).toBe(false);
    expect(
      momentByName
        .get("Preparação")!
        .steps.some((step) => /forno de confiança/i.test(step.instructions)),
    ).toBe(true);
    expect(
      momentByName
        .get("Forno")!
        .steps.filter((step) => /55 minutos/i.test(step.instructions)),
    ).toHaveLength(1);
  });

  it("parses Brazilian volume measures and preserves authored subpreparations", () => {
    const result = parseStructuredRecipeHtml(
      tiramisuHtml,
      "https://paolacarosella.com.br/receitas/tiramisu/",
    );

    expect(result.ingredients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Creme de leite fresco",
          inputQuantity: 1_000,
          inputUnit: "ml",
          quantityG: 1_000,
          notes: "Para bater chantilly, com 35% de gordura",
        }),
        expect.objectContaining({
          name: "Ácido tartárico",
          inputQuantity: 0.25,
          quantityG: 1,
        }),
        expect.objectContaining({
          name: "Vinho marsala",
          inputQuantity: 2,
          quantityG: 30,
        }),
        expect.objectContaining({
          name: "Café forte",
          inputQuantity: 360,
          inputUnit: "ml",
          quantityG: 360,
        }),
      ]),
    );
    expect(result.moments.map((moment) => moment.name)).toEqual([
      "Mise en place",
      "Queijo mascarpone",
      "Biscoito tipo champanhe ou pão-de-ló",
      "Creme tiramisù",
      "Montagem do tiramisù",
    ]);
    expect(result.moments.every((moment) => moment.description === "")).toBe(
      true,
    );
    expect(
      result.moments
        .flatMap((moment) => moment.steps)
        .every((step) => !/^Etapa \d+$/i.test(step.name)),
    ).toBe(true);
    expect(
      result.moments.find((moment) => moment.name === "Queijo mascarpone")!
        .steps[0]!.instructions,
    ).toContain("80 ºC");
    expect(
      result.moments
        .find((moment) => moment.name === "Queijo mascarpone")!
        .steps.find((step) => /24 horas/i.test(step.instructions)),
    ).toEqual(
      expect.objectContaining({
        name: "Refrigerar por 1440 minutos",
        durationMinutes: 1_440,
        kind: "cold",
      }),
    );
    expect(result.warnings.join(" ")).toContain(
      "subpreparações nomeadas pela fonte foram preservadas",
    );
  });
});
