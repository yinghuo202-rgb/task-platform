import { DashboardSummary } from "@/components/dashboard-summary";
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ subscriptions?: string }> }) {
  const params = await searchParams;
  return <DashboardSummary openSubscriptions={params.subscriptions === "1"} />;
}
