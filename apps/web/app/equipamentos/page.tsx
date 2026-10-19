import { AppShell } from "@/components/app-shell";
import { EquipmentDashboard } from "@/components/equipment-dashboard";
import { getEquipment } from "@/lib/equipment";
import { apiRequestHeaders } from "@/lib/server-api";
import { authRequired } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const headers = await apiRequestHeaders();
  const profile = await getSettings(headers);
  if (!profile.account.operationalAccess && profile.account.role !== "owner")
    redirect("/pedidos");
  const workspace = await getEquipment(headers);
  return (
    <AppShell
      tenantName={profile.tenantName}
      ownerName={profile.ownerName}
      avatarDataUrl={profile.account.avatarDataUrl}
      authEnabled={authRequired()}
      access={profile.account}
      currentSection="Equipamentos"
    >
      <EquipmentDashboard initialWorkspace={workspace} />
    </AppShell>
  );
}
