import { AppShell } from "@/components/app-shell";
import { RecipesDashboard } from "@/components/recipes-dashboard";
import { getRecipes } from "@/lib/recipes";
import { apiRequestHeaders } from "@/lib/server-api";
import { authRequired } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const headers = await apiRequestHeaders();
  const profile = await getSettings(headers);
  if (!profile.account.operationalAccess && profile.account.role !== "owner")
    redirect("/pedidos");
  const workspace = await getRecipes(headers);

  return (
    <AppShell
      tenantName={profile.tenantName}
      ownerName={profile.ownerName}
      avatarDataUrl={profile.account.avatarDataUrl}
      authEnabled={authRequired()}
      access={profile.account}
      currentSection="Receitas"
    >
      <RecipesDashboard initialWorkspace={workspace} />
    </AppShell>
  );
}
