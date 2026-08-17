import { CalendarWorkspace } from "./calendar-workspace";

export function DashboardSummary({ openSubscriptions = false }: { openSubscriptions?: boolean }) {
  return <CalendarWorkspace openSubscriptions={openSubscriptions} />;
}
