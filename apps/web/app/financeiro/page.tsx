import { AppShell } from "@/components/app-shell";
import {
  FinanceDashboard,
  FinanceYearDashboard,
} from "@/components/finance-dashboard";
import { getFinance, getFinanceYear } from "@/lib/finance";
import { apiRequestHeaders } from "@/lib/server-api";
import { authRequired } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; year?: string }>;
}) {
  const query = await searchParams;
  const requested = query.month;
  const month =
    requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : new Date().toISOString().slice(0, 7);
  const requestedYear = Number(query.year);
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2000 &&
    requestedYear <= 2100
      ? requestedYear
      : Number(month.slice(0, 4));
  const annualView = query.view === "year";
  const headers = await apiRequestHeaders();
  const profile = await getSettings(headers);
  if (!profile.account.financialAccess && profile.account.role !== "owner")
    redirect("/");
  if (annualView) {
    const workspace = await getFinanceYear(year, headers);
    return (
      <AppShell
        tenantName={profile.tenantName}
        ownerName={profile.ownerName}
        avatarDataUrl={profile.account.avatarDataUrl}
        authEnabled={authRequired()}
        access={profile.account}
        currentSection="Financeiro"
      >
        <FinanceYearDashboard
          key={`year-${workspace.year}`}
          workspace={workspace}
        />
      </AppShell>
    );
  }
  const workspace = await getFinance(month, headers);
  return (
    <AppShell
      tenantName={profile.tenantName}
      ownerName={profile.ownerName}
      avatarDataUrl={profile.account.avatarDataUrl}
      authEnabled={authRequired()}
      access={profile.account}
      currentSection="Financeiro"
    >
      <FinanceDashboard key={workspace.month} initialWorkspace={workspace} />
    </AppShell>
  );
}
