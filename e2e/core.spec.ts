import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const routes = [
  { path: "/", heading: /Bom dia|Boa tarde|Boa noite/ },
  { path: "/pedidos", heading: "O combinado, no ritmo da cozinha." },
  {
    path: "/receitas",
    heading: "Para repetir o carinho, sem depender da memória.",
  },
  { path: "/despensa", heading: "O que já está à mão." },
  { path: "/clientes", heading: "Quem volta, já chega conhecida." },
  { path: "/financeiro", heading: "O mês, sem sustos." },
  { path: "/equipamentos", heading: "As mãos também têm suas companheiras." },
  { path: "/ajustes", heading: "Os combinados da sua cozinha." },
  { path: "/entrar", heading: "Vamos abrir a bancada?" },
] as const;

async function expectNoWcagViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    result.violations,
    result.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map((node) => `  ${node.target.join(" ")}: ${node.failureSummary}`)
            .join("\n")}`,
      )
      .join("\n\n"),
  ).toEqual([]);
}

async function authenticateTestContext(context: BrowserContext) {
  await context.addCookies([
    {
      name: "bancada_identity",
      value: "e2e-authenticated",
      url: process.env.E2E_BASE_URL ?? "http://localhost:6001",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.describe("jornadas essenciais", () => {
  test.beforeEach(async ({ context }) => authenticateTestContext(context));

  for (const route of routes) {
    test(`${route.path} carrega e atende ao recorte WCAG A/AA`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await expect(
        page.getByRole("heading", { level: 1, name: route.heading }),
      ).toBeVisible();
      if (route.path === "/entrar") {
        await expect(
          page.getByText("Zucchero", { exact: true }).first(),
        ).toBeVisible();
      }
      await expectNoWcagViolations(page);
    });
  }

  test("abre e fecha detalhes da receita sem alterar dados", async ({
    page,
  }) => {
    await page.goto("/receitas");
    await page
      .getByRole("button", { name: /Abrir detalhes de Bolo de chocolate/ })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Bolo de chocolate" }),
    ).toBeVisible();
    const glassBar = dialog.locator(".modal-glass-header");
    const closeButton = dialog.getByRole("button", {
      name: "Fechar detalhes da receita",
    });
    await expect(glassBar).toBeVisible();
    await expect(glassBar).toContainText("Bolo de chocolate");
    await expect(
      dialog.getByText("Ficha da receita", { exact: true }),
    ).toHaveCount(1);
    await expect(glassBar).toHaveCSS("backdrop-filter", /blur/);
    const closePositionBeforeScroll = await closeButton.boundingBox();
    const detailsScroll = dialog.locator(".recipe-details-scroll");
    await detailsScroll.evaluate((area) => {
      area.scrollTop = 500;
    });
    await expect
      .poll(() => detailsScroll.evaluate((area) => area.scrollTop))
      .toBeGreaterThan(0);
    const closePositionAfterScroll = await closeButton.boundingBox();
    expect(closePositionBeforeScroll).not.toBeNull();
    expect(closePositionAfterScroll).not.toBeNull();
    expect(
      Math.abs(
        (closePositionBeforeScroll?.y ?? 0) -
          (closePositionAfterScroll?.y ?? 0),
      ),
    ).toBeLessThan(2);
    const simulatedIngredients = dialog.getByRole("list", {
      name: "Ingredientes para este rendimento",
    });
    await expect(simulatedIngredients).toBeVisible();
    await expect(simulatedIngredients).toHaveCSS("display", "grid");
    expect(
      await simulatedIngredients.evaluate(
        (list) =>
          getComputedStyle(list).gridTemplateColumns.split(/\s+/).length,
      ),
    ).toBe(2);
    await expect(simulatedIngredients.getByRole("listitem").first()).toHaveCSS(
      "display",
      "grid",
    );
    const ingredientsSection = dialog
      .locator("details.recipe-detail-collapsible")
      .filter({ hasText: "O que entra" });
    await expect(ingredientsSection).toHaveAttribute("open", "");
    await ingredientsSection.locator("summary").click();
    await expect(ingredientsSection).not.toHaveAttribute("open", "");
    await ingredientsSection.locator("summary").click();
    await expect(ingredientsSection).toHaveAttribute("open", "");
    await expectNoWcagViolations(page);
    await closeButton.click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("apresenta uma edição sem numerá-la antes da publicação", async ({
    page,
  }) => {
    await page.goto("/receitas");
    await page
      .getByRole("button", { name: /Abrir detalhes de Bolo de chocolate/ })
      .click();

    const details = page.getByRole("dialog", { name: "Bolo de chocolate" });
    await details.getByRole("button", { name: "Criar nova edição" }).click();

    const editor = page.getByRole("dialog", {
      name: "O que ficou ainda melhor neste preparo?",
    });
    await expect(editor).toBeVisible();
    await expect(
      editor.getByRole("button", { name: "Guardar edição" }),
    ).toBeVisible();
    await expect(
      editor.getByRole("button", { name: "Publicar como versão 2" }),
    ).toBeVisible();
    const recipeYield = editor.getByLabel("Rendimento total");
    await recipeYield.fill("560");
    await expect(recipeYield).toHaveValue("560");
    expect(
      await recipeYield.evaluate(
        (field) => (field as HTMLInputElement).validity.valid,
      ),
    ).toBe(true);
    await editor
      .locator("summary.recipe-collapsible-summary")
      .filter({ hasText: "O que entra" })
      .click();
    const ingredientQuantity = editor
      .getByLabel("Quantidade informada")
      .first();
    await ingredientQuantity.fill("150");
    await expect(ingredientQuantity).toHaveValue("150");
    await expect(ingredientQuantity).toHaveAttribute("step", "any");
    expect(
      await ingredientQuantity.evaluate(
        (field) => (field as HTMLInputElement).validity.valid,
      ),
    ).toBe(true);
    const ingredientUnit = editor.getByLabel("Unidade da anotação").first();
    await ingredientUnit.click();
    await editor.getByRole("option", { name: "unidades" }).click();
    const unitWeight = editor.getByLabel("Peso líquido por unidade (g)");
    await unitWeight.fill("60");
    await expect(unitWeight).toHaveValue("60");
    await expect(unitWeight).toHaveAttribute("step", "any");
    expect(
      await unitWeight.evaluate(
        (field) => (field as HTMLInputElement).validity.valid,
      ),
    ).toBe(true);
    await expect(
      editor.getByLabel(/Especificação nesta receita/).first(),
    ).toBeVisible();
    await editor
      .locator("summary.recipe-collapsible-summary")
      .filter({ hasText: "Momentos e etapas" })
      .click();
    const momentResult = editor.getByLabel("Resultado deste momento").first();
    await expect(momentResult).toBeVisible();
    await expect(momentResult).toHaveAttribute("maxlength", "300");
    await expect(momentResult).toHaveCSS("resize", "none");
    await expect(editor.getByText("Rascunho", { exact: true })).toHaveCount(0);
    await expectNoWcagViolations(page);
  });

  test("mantém os resumos da receita íntegros em telas estreitas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/receitas");
    await page
      .getByRole("button", { name: /Abrir detalhes de Bolo de chocolate/ })
      .click();

    const dialog = page.getByRole("dialog", { name: "Bolo de chocolate" });
    const simulatedIngredients = dialog.getByRole("list", {
      name: "Ingredientes para este rendimento",
    });
    expect(
      await simulatedIngredients.evaluate(
        (list) =>
          getComputedStyle(list).gridTemplateColumns.split(/\s+/).length,
      ),
    ).toBe(1);
    const momentsSection = dialog
      .locator("details.recipe-detail-collapsible")
      .filter({ hasText: "Momentos e etapas" });
    await momentsSection.locator(":scope > summary").click();
    await expect(momentsSection).toHaveAttribute("open", "");
    await expect(
      momentsSection.locator("details.recipe-detail-moment").first(),
    ).toHaveAttribute("open", "");
    const portraitDimensions = await dialog
      .locator(".recipe-details-panel")
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    expect(portraitDimensions.scrollWidth).toBeLessThanOrEqual(
      portraitDimensions.clientWidth,
    );

    await page.setViewportSize({ width: 812, height: 375 });
    await expect(dialog).toBeVisible();
    const dimensions = await dialog
      .locator(".recipe-details-panel")
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  test("usa o campo padrão ao importar uma receita por link", async ({
    page,
  }) => {
    await page.goto("/receitas");
    await page.getByRole("button", { name: "Importar por link" }).click();

    const input = page.getByLabel("Link da receita");
    await expect(input).toBeVisible();
    await expect(input).toHaveClass(/text-field-input/);
    await expect(input).toHaveCSS("min-height", "48px");
    await expect(input).toHaveCSS("border-radius", "13px");
    await expect(input).toHaveAttribute(
      "aria-describedby",
      "recipe-source-url-help",
    );

    await input.focus();
    await expect(input).toHaveCSS("outline-style", "solid");
  });

  test("mantém o cabeçalho de vidro fixo nos modais", async ({ page }) => {
    const modalCases = [
      { route: "/receitas", trigger: "Importar por link" },
      { route: "/despensa", trigger: "Adicionar compra" },
      { route: "/clientes", trigger: "Nova cliente" },
      { route: "/financeiro", trigger: "Registrar despesa" },
      { route: "/equipamentos", trigger: "Novo equipamento" },
    ] as const;

    for (const modalCase of modalCases) {
      await page.goto(modalCase.route);
      await page
        .getByRole("button", { name: modalCase.trigger, exact: true })
        .click();

      const dialog = page.locator("dialog[open]").last();
      const header = dialog.locator(".modal-glass-header");
      const scroller = dialog.locator(".purchase-panel-scroll").first();

      await expect(header).toHaveCount(1);
      await expect(header).toHaveCSS("position", "absolute");
      await expect(header).toHaveCSS("backdrop-filter", /blur/);
      await dialog.evaluate((element) =>
        Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => undefined)),
        ),
      );

      const positionBeforeScroll = await header.boundingBox();
      const panelPosition = await dialog
        .locator(".purchase-panel")
        .boundingBox();
      const scrollerPosition = await scroller.boundingBox();
      const scrollPaddingTop = await scroller.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).scrollPaddingTop),
      );
      await scroller.evaluate((element) => {
        element.scrollTop = Math.min(
          320,
          element.scrollHeight - element.clientHeight,
        );
      });
      const positionAfterScroll = await header.boundingBox();
      const panelDimensions = await dialog
        .locator(".purchase-panel")
        .evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));

      expect(positionBeforeScroll).not.toBeNull();
      expect(positionAfterScroll).not.toBeNull();
      expect(panelPosition).not.toBeNull();
      expect(scrollerPosition).not.toBeNull();
      expect(
        Math.abs((panelPosition?.y ?? 0) - (scrollerPosition?.y ?? 0)),
      ).toBeLessThan(2);
      expect(scrollPaddingTop).toBeGreaterThanOrEqual(80);
      expect(
        Math.abs(
          (positionBeforeScroll?.y ?? 0) - (positionAfterScroll?.y ?? 0),
        ),
      ).toBeLessThan(2);
      expect(panelDimensions.scrollWidth).toBeLessThanOrEqual(
        panelDimensions.clientWidth,
      );

      await header.getByRole("button").click();
      await expect(dialog).toBeHidden();
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/despensa");
    await page
      .getByRole("button", { name: "Adicionar compra", exact: true })
      .click();

    const mobileDialog = page.locator("dialog[open]").last();
    const mobilePanel = mobileDialog.locator(".purchase-panel");
    const mobileHeader = mobileDialog.locator(".modal-glass-header");
    const [panelBox, headerBox] = await Promise.all([
      mobilePanel.boundingBox(),
      mobileHeader.boundingBox(),
    ]);

    expect(panelBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.y).toBeGreaterThanOrEqual(panelBox!.y);
    expect(headerBox!.x + headerBox!.width).toBeLessThanOrEqual(
      panelBox!.x + panelBox!.width,
    );
    await expectNoWcagViolations(page);
  });

  test("abre o cuidado de privacidade e exige confirmação", async ({
    page,
  }) => {
    await page.goto("/clientes");
    await page
      .getByRole("button", { name: /Abrir cadastro de Ana Paula/ })
      .click();
    await page.getByRole("button", { name: "Anonimizar dados" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Remover os dados pessoais?",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Anonimizar agora" }),
    ).toBeDisabled();
    await dialog.evaluate((element) =>
      Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    await expectNoWcagViolations(page);
    await dialog
      .getByRole("button", { name: "Fechar confirmação de anonimização" })
      .click();
  });

  test("abre a programação de indisponibilidade sem persistir", async ({
    page,
  }) => {
    await page.goto("/equipamentos");
    const availability = page
      .getByRole("button", { name: "Indisponibilidade" })
      .first();
    if ((await availability.count()) === 0) {
      await expect(
        page.getByRole("heading", {
          name: "A cozinha ainda não apresentou suas ferramentas.",
        }),
      ).toBeVisible();
      return;
    }
    await availability.click();
    await expect(
      page.getByRole("dialog", { name: /Quando .* não poderá ajudar/ }),
    ).toBeVisible();
    await expectNoWcagViolations(page);
    await page.getByRole("button", { name: "Fechar" }).click();
  });

  test("abre o menu do perfil e o fecha pelo teclado", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /Abrir menu do perfil/ });

    await trigger.click();
    await expect(
      page.getByRole("link", { name: "Configuração de perfil" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
    await expectNoWcagViolations(page);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("link", { name: "Configuração de perfil" }),
    ).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole("link", { name: "Configuração de perfil" }).click();
    await expect(page).toHaveURL(/\/ajustes#perfil$/);
    await expect(
      page.getByLabel("Configuração de perfil e acesso atual"),
    ).toBeVisible();
  });

  test("mantém uma única moldura nos controles compostos", async ({ page }) => {
    await page.goto("/ajustes");

    const controls = [
      page.getByLabel("Margem padrão"),
      page.getByLabel("Pagamento habitual"),
    ];

    for (const control of controls) {
      await expect(control).toBeVisible();
      await expect
        .poll(() =>
          control.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              backgroundColor: style.backgroundColor,
              borderTopWidth: style.borderTopWidth,
              boxShadow: style.boxShadow,
            };
          }),
        )
        .toEqual({
          backgroundColor: "rgba(0, 0, 0, 0)",
          borderTopWidth: "0px",
          boxShadow: "none",
        });
    }

    await controls[0].focus();
    await expect
      .poll(() =>
        controls[0].evaluate(
          (element) => getComputedStyle(element.parentElement!).boxShadow,
        ),
      )
      .not.toBe("none");

    const [paymentBox, deliveryBox] = await Promise.all(
      ["#default-payment", "#default-delivery"].map((selector) =>
        page.locator(selector).evaluate((element) => {
          const box = element.parentElement!.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            width: box.width,
          };
        }),
      ),
    );
    expect(paymentBox.width).toBeGreaterThan(0);
    expect(deliveryBox.width).toBeGreaterThan(0);
    expect(paymentBox.right).toBeLessThanOrEqual(deliveryBox.left);
    expect(Math.abs(paymentBox.top - deliveryBox.top)).toBeLessThanOrEqual(1);
  });

  test("mantém o calendário inteiro dentro do modal", async ({ page }) => {
    await page.goto("/equipamentos");
    await page.getByRole("button", { name: "Novo equipamento" }).click();
    const dialog = page.getByRole("dialog", {
      name: "O que trabalha com você?",
    });
    await dialog.getByRole("button", { name: "Abrir calendário" }).click();

    const calendar = dialog.getByRole("dialog", { name: "Escolher data" });
    await expect(calendar).toBeVisible();
    const [calendarBox, scrollBox] = await Promise.all([
      calendar.boundingBox(),
      dialog.locator(".purchase-panel-scroll").boundingBox(),
    ]);

    expect(calendarBox).not.toBeNull();
    expect(scrollBox).not.toBeNull();
    expect(calendarBox!.width).toBeLessThanOrEqual(300);
    expect(calendarBox!.y).toBeGreaterThanOrEqual(scrollBox!.y);
    expect(calendarBox!.y + calendarBox!.height).toBeLessThanOrEqual(
      scrollBox!.y + scrollBox!.height,
    );
    expect(calendarBox!.x + calendarBox!.width).toBeLessThanOrEqual(
      scrollBox!.x + scrollBox!.width,
    );
  });

  test("oferece categoria contextual sem abandonar a compra", async ({
    page,
  }) => {
    await page.goto("/despensa");
    await page.getByRole("button", { name: "Adicionar compra" }).click();
    const dialog = page.getByRole("dialog", { name: "O que chegou hoje?" });

    await dialog.getByLabel("Qual produto você comprou?").click();
    await dialog
      .getByRole("option", { name: "Cadastrar novo produto comprado…" })
      .click();
    await expect(dialog.getByLabel("Ingrediente da receita")).toBeVisible();
    await expect(
      dialog.getByText("Como esse produto aparece nas suas receitas?"),
    ).toBeVisible();

    const category = dialog.getByLabel("Categoria");
    await category.fill("Castanhas e sementes");
    await dialog
      .getByRole("option", {
        name: "Criar categoria “Castanhas e sementes”",
      })
      .click();

    await expect(
      dialog.getByRole("heading", { name: "Criar sem sair da compra" }),
    ).toBeVisible();
    await expect(dialog.getByLabel("Nome da categoria")).toHaveValue(
      "Castanhas e sementes",
    );
    await expect(
      dialog.getByRole("button", { name: "Criar e selecionar" }),
    ).toBeEnabled();
    await expectNoWcagViolations(page);

    await dialog
      .getByRole("button", { name: "Cancelar nova categoria" })
      .click();
    await category.fill("Chocolate");
    await dialog
      .getByRole("option", { name: "Criar categoria “Chocolate”" })
      .click();
    await dialog.getByRole("button", { name: "Chocolates e cacaus" }).click();
    await expect(category).toHaveValue("Chocolates e cacaus");
  });

  test("usa horário próprio em 24 horas com escape pelo teclado", async ({
    page,
  }) => {
    await page.goto("/ajustes");
    await expect(page.locator('input[type="time"]')).toHaveCount(0);

    const start = page.getByRole("textbox", {
      name: "Início de Segunda-feira",
      exact: true,
    });
    await expect(start).toHaveValue("08:00");
    await page
      .getByRole("button", {
        name: "Abrir seletor de Início de Segunda-feira",
      })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Início de Segunda-feira" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Início de Segunda-feira" }),
    ).toBeHidden();
    await expect(start).toBeFocused();
  });

  test("mantém os campos do pedido alinhados em cada etapa", async ({
    page,
  }) => {
    await page.goto("/pedidos");
    const newOrderButton = page
      .getByRole("button", { name: "Nova encomenda" })
      .first();
    await newOrderButton.click();

    const createOrderDialog = page.getByRole("dialog", {
      name: "Vamos montar o combinado.",
    });
    await expect(createOrderDialog).toBeVisible();
    await expect(createOrderDialog.locator(".order-create-scroll")).toHaveCSS(
      "overflow-y",
      "auto",
    );
    await page
      .getByRole("button", { name: "Encomenda", exact: true })
      .last()
      .click();

    const note = page.getByLabel("Detalhes da cliente");
    await expect(note).toBeVisible();
    await expect(page.getByText("0 / 500", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        note.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            resize: style.resize,
          };
        }),
      )
      .toEqual({ resize: "none" });

    const [primaryBox, noteBox] = await Promise.all([
      page.locator(".order-item-primary").boundingBox(),
      page.locator(".order-item-note").boundingBox(),
    ]);
    expect(primaryBox).not.toBeNull();
    expect(noteBox).not.toBeNull();
    expect(Math.abs(primaryBox!.y - noteBox!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(primaryBox!.height - noteBox!.height)).toBeLessThanOrEqual(
      1,
    );
    expect(primaryBox!.x + primaryBox!.width).toBeLessThanOrEqual(noteBox!.x);

    await page
      .getByRole("button", { name: "Disponibilidade", exact: true })
      .last()
      .click();
    const orderForm = page.locator("form.order-workbench");
    await expect(
      page.getByRole("button", { name: "Preço", exact: true }).last(),
    ).toBeEnabled();
    await orderForm.evaluate((form) =>
      (form as HTMLFormElement).requestSubmit(),
    );

    const priceTitle = page.getByRole("heading", {
      name: "Quanto precisa voltar?",
    });
    await expect(priceTitle).toBeVisible();
    await expect(priceTitle).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Confirmar encomenda" }),
    ).toBeEnabled();
    const priceTitleBox = await priceTitle.boundingBox();
    expect(priceTitleBox).not.toBeNull();
    expect(priceTitleBox!.y).toBeGreaterThanOrEqual(68);
    expect(priceTitleBox!.y).toBeLessThan(page.viewportSize()!.height);

    const controlBox = (selector: string) =>
      page.locator(selector).evaluate((element) => {
        const box = element.parentElement!.getBoundingClientRect();
        return { height: box.height, y: box.y };
      });
    const [costBox, marginBox, depositBox, paymentBox] = await Promise.all([
      controlBox("#order-additional-cost"),
      controlBox("#order-margin"),
      controlBox("#order-deposit"),
      controlBox("#order-payment"),
    ]);
    expect(Math.abs(costBox.y - marginBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(depositBox.y - paymentBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(costBox.height - marginBox.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(depositBox.height - paymentBox.height)).toBeLessThanOrEqual(
      1,
    );

    await page.getByRole("button", { name: "Fechar nova encomenda" }).click();
    await expect(createOrderDialog).toBeHidden();
    await expect(newOrderButton).toBeFocused();
  });

  test("avança e retorna no acesso protegido em tela pequena", async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/entrar");

    await expect(
      page.getByRole("heading", { name: "Vamos abrir a bancada?" }),
    ).toBeVisible();
    await page.getByLabel("E-mail").fill("stefanie@example.com");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByRole("heading", { name: "Agora, sua senha" }),
    ).toBeVisible();
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await page.getByRole("button", { name: "Trocar e-mail" }).click();
    await expect(page.getByLabel("E-mail")).toHaveValue("stefanie@example.com");
    await expect(
      page.getByRole("link", { name: "Usar a demonstração" }),
    ).toHaveCount(0);
  });

  test("oferece a criação de uma confeitaria sem sair da entrada", async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/entrar?returnTo=%2Fpedidos");

    await page.getByRole("link", { name: /Criar minha conta/ }).click();
    await expect(page).toHaveURL(/cadastro=1/);
    await expect(
      page.getByRole("heading", { name: "Vamos criar sua bancada." }),
    ).toBeVisible();
    await expectNoWcagViolations(page);

    await page.getByLabel("Como podemos chamar você?").fill("Silvia Andrade");
    await page.getByLabel("Nome da sua confeitaria").fill("Doçuras da Silvia");
    await page.getByLabel("E-mail de acesso").fill("silvia@example.com");
    await page.getByRole("button", { name: "Criar minha senha" }).click();

    await expect(
      page.getByRole("heading", { name: "Agora, uma senha segura" }),
    ).toBeVisible();
    await expect(page.getByLabel("Senha", { exact: true })).toBeFocused();
    await page.getByLabel("Senha", { exact: true }).fill("DoceSeguro#42");
    await page.getByLabel("Repita a senha").fill("DoceSeguro#42");
    await expect(
      page.getByRole("button", { name: "Criar minha conta" }),
    ).toBeEnabled();
    await expectNoWcagViolations(page);
  });

  test("conclui as três etapas quando o Authenticator é exigido", async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    await page.route("**/auth/password", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "mfa-required" }),
      });
    });
    await page.route("**/auth/mfa", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "set-cookie":
            "bancada_identity=e2e-authenticated; Path=/; HttpOnly; SameSite=Lax",
        },
        body: JSON.stringify({ status: "authenticated", returnTo: "/pedidos" }),
      });
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill("stefanie@example.com");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByLabel("Senha", { exact: true }).fill("segredo-forte");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(
      page.getByRole("heading", { name: "Confirme que é você" }),
    ).toBeVisible();
    const code = page.getByLabel("Código de autenticação");
    await expect(code).toBeFocused();
    await expect(code).toHaveAttribute("autocomplete", "one-time-code");
    await code.fill("123456");
    await page.getByRole("button", { name: "Confirmar e entrar" }).click();

    await expect(page).toHaveURL(/\/pedidos$/);
  });
});

test("PWA registra o service worker e oferece uma página offline", async ({
  context,
  page,
}) => {
  await authenticateTestContext(context);
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean(await navigator.serviceWorker.getRegistration()),
      ),
    )
    .toBe(true);

  await page.goto("/offline.html");
  await expect(page).toHaveTitle("Sem conexão — Zucchero");
  await expect(
    page.getByRole("heading", { name: "A internet deu uma pausa." }),
  ).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A internet deu uma pausa." }),
  ).toBeVisible();
});
