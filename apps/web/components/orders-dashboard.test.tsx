import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/pedidos/actions", () => ({
  calculateDeliveryQuoteAction: vi.fn(),
  mutateOrderAction: vi.fn(),
}));

import { OrdersDashboard } from "@/components/orders-dashboard";
import {
  fallbackCustomerWorkspace,
  type CustomerWorkspace,
} from "@/lib/customers";
import { NEW_ORDER_LABEL } from "@/lib/order-ui";
import { emptyOrderWorkspace } from "@/lib/orders";
import { demoPantry } from "@/lib/pantry";
import { demoRecipes } from "@/lib/recipes";
import type { SettingsWorkspace } from "@/lib/settings";

const emptyCustomers: CustomerWorkspace = {
  summary: {
    customerCount: 0,
    deliveryReadyCount: 0,
    returningCount: 0,
  },
  customers: [],
};

const settings = {
  sales: {
    defaultMarginPercentage: 35,
    defaultDepositPercentage: 50,
    defaultPaymentMethod: "pix",
    defaultDeliveryMode: "delivery",
    deliveryCostPerKm: 0,
  },
  integrations: { googleMapsRoutesEnabled: false },
} as SettingsWorkspace;

describe("OrdersDashboard", () => {
  it("renders a guided start instead of failing for a tenant without customers or recipes", () => {
    const markup = renderToStaticMarkup(
      <OrdersDashboard
        pantry={demoPantry}
        recipes={{ ...demoRecipes, recipes: [] }}
        initialOrders={emptyOrderWorkspace}
        customers={emptyCustomers}
        settings={settings}
        operationalAccess
      />,
    );

    expect(markup).toContain("Antes do primeiro pedido");
    expect(markup).toContain("Cadastre uma cliente");
    expect(markup).toContain("Publique uma receita");
    expect(markup).not.toContain('class="button button-primary"');
  });

  it("uses the canonical new-order name in the contextual dialog", () => {
    const markup = renderToStaticMarkup(
      <OrdersDashboard
        pantry={demoPantry}
        recipes={demoRecipes}
        initialOrders={emptyOrderWorkspace}
        customers={fallbackCustomerWorkspace}
        settings={settings}
        operationalAccess
        initialCreateOpen
      />,
    );

    expect(markup).toContain('aria-labelledby="new-order-title"');
    expect(markup).toContain(NEW_ORDER_LABEL);
    expect(markup).toContain("Etapa 1 de 4");
    expect(markup).not.toContain('<p class="eyebrow">Nova encomenda</p>');
    expect(markup.match(/Etapa 1 de 4/g)).toHaveLength(1);
    expect(markup).not.toContain("Voltar aos pedidos");
    expect(markup).toContain("Quem fará a entrega?");
    expect(markup).toContain("Própria");
    expect(markup).toContain("Terceirizada");
    expect(markup).toContain("Plataforma integrada");
    expect(markup).toContain("nenhuma conectada");
  });
});
