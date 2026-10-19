import { AppShell } from "@/components/app-shell";
import { CustomersDashboard } from "@/components/customers-dashboard";
import { getCustomers } from "@/lib/customers";
import { getSettings } from "@/lib/settings";
import { apiRequestHeaders } from "@/lib/server-api";
import { authRequired } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const headers = await apiRequestHeaders();
  const profile = await getSettings(headers);
  if (!profile.account.operationalAccess && profile.account.role !== "owner")
    redirect("/pedidos");
  const customers = await getCustomers(headers);

  return (
    <AppShell
      tenantName={profile.tenantName}
      ownerName={profile.ownerName}
      avatarDataUrl={profile.account.avatarDataUrl}
      authEnabled={authRequired()}
      access={profile.account}
      currentSection="Clientes"
    >
      <CustomersDashboard initialWorkspace={customers} />
    </AppShell>
  );
}
