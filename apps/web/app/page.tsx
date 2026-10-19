import { AppShell } from "@/components/app-shell";
import { TodayDashboard } from "@/components/today-dashboard";
import { getToday } from "@/lib/today";
import { getPantry } from "@/lib/pantry";
import { getOrders, type StoredOrderSummary } from "@/lib/orders";
import { apiRequestHeaders } from "@/lib/server-api";
import { authRequired } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const saoPauloDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const saoPauloTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function deliveryStatus(order: StoredOrderSummary) {
  if (order.status === "ready") return "Pronto para sair";
  if (order.status === "in_production") return "Na bancada";
  if (order.status === "completed") return "Entregue";
  return "Aguardando preparo";
}

export default async function HomePage() {
  const headers = await apiRequestHeaders();
  const profile = await getSettings(headers);
  if (!profile.account.operationalAccess && profile.account.role !== "owner") {
    redirect(profile.account.financialAccess ? "/pedidos" : "/ajustes");
  }
  const [today, pantry, orderWorkspace] = await Promise.all([
    getToday(headers),
    getPantry(headers),
    getOrders(headers),
  ]);
  const firstName = profile.ownerName.trim().split(/\s+/)[0] ?? "Proprietária";
  const todayKey = saoPauloDay.format(new Date());
  const deliveries = orderWorkspace.orders
    .filter(
      (order) =>
        order.status !== "cancelled" &&
        saoPauloDay.format(new Date(order.deliveryAt)) === todayKey,
    )
    .sort((left, right) => left.deliveryAt.localeCompare(right.deliveryAt))
    .slice(0, 4)
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      time: saoPauloTime.format(new Date(order.deliveryAt)).replace(":", "h"),
      title: order.recipeName,
      customerName: order.customerName,
      mode: order.deliveryMode === "delivery" ? "Entrega" : "Retirada",
      status: deliveryStatus(order),
    }));
  const dayOrders = orderWorkspace.orders.filter(
    (order) =>
      order.status !== "cancelled" &&
      saoPauloDay.format(new Date(order.deliveryAt)) === todayKey,
  );
  const expected = dayOrders.reduce((sum, order) => sum + order.price, 0);
  const received = dayOrders.reduce(
    (sum, order) => sum + order.paymentResult.grossReceived,
    0,
  );
  const canSeeFinancial =
    profile.account.role === "owner" || profile.account.financialAccess;
  const personalizedToday = {
    ...today,
    tenantName: profile.tenantName,
    ownerName: profile.ownerName,
    greeting: `Bom dia, ${firstName}. A cozinha já tem seu ritmo.`,
  };

  return (
    <AppShell
      tenantName={profile.tenantName}
      ownerName={profile.ownerName}
      avatarDataUrl={profile.account.avatarDataUrl}
      authEnabled={authRequired()}
      access={profile.account}
      currentSection="Hoje"
    >
      <TodayDashboard
        today={personalizedToday}
        attention={pantry.attention.slice(0, 3)}
        deliveries={deliveries}
        dayPulse={
          canSeeFinancial
            ? {
                orderCount: dayOrders.length,
                expected,
                received,
                pending: Math.max(0, expected - received),
              }
            : null
        }
      />
    </AppShell>
  );
}
