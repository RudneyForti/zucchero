import { AppShell } from "@/components/app-shell";
import { SettingsDashboard } from "@/components/settings-dashboard";
import { getSettings } from "@/lib/settings";
import { apiRequestHeaders } from "@/lib/server-api";
import { authRequired } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await getSettings(await apiRequestHeaders());
  return (
    <AppShell
      tenantName={workspace.tenantName}
      ownerName={workspace.ownerName}
      avatarDataUrl={workspace.account.avatarDataUrl}
      authEnabled={authRequired()}
      access={workspace.account}
      currentSection="Ajustes"
    >
      <SettingsDashboard initialWorkspace={workspace} />
    </AppShell>
  );
}
