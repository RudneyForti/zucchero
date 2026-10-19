import { AppShell } from "@/components/app-shell";
import { OrdersDashboard } from "@/components/orders-dashboard";
import { getCustomers } from "@/lib/customers";
import { getOrders } from "@/lib/orders";
import { getPantry } from "@/lib/pantry";
import { getRecipes } from "@/lib/recipes";
import { getSettings } from "@/lib/settings";
import { apiRequestHeaders } from "@/lib/server-api";
import { authRequired } from "@/lib/auth";
import { NEW_ORDER_ACTION } from "@/lib/order-ui";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ acao?: string | string[] }>;
}) {
  const requestedAction = (await searchParams).acao;
  const action = Array.isArray(requestedAction)
    ? requestedAction[0]
    : requestedAction;
  const headers = await apiRequestHeaders();
  const [pantry, recipes, orders, customers, settings] = await Promise.all([
    getPantry(headers),
    getRecipes(headers),
    getOrders(headers),
    getCustomers(headers),
    getSettings(headers),
  ]);

  return (
    <AppShell
      tenantName={settings.tenantName}
      ownerName={settings.ownerName}
      avatarDataUrl={settings.account.avatarDataUrl}
      authEnabled={authRequired()}
      access={settings.account}
      currentSection="Pedidos"
    >
      <OrdersDashboard
        pantry={pantry}
        recipes={recipes}
        initialOrders={orders}
        customers={customers}
        settings={settings}
        operationalAccess={
          settings.account.role === "owner" ||
          settings.account.operationalAccess
        }
        initialCreateOpen={action === NEW_ORDER_ACTION}
      />
    </AppShell>
  );
}
