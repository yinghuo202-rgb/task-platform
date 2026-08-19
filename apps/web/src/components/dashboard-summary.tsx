import { CalendarWorkspace } from "./calendar-workspace";

export function DashboardSummary({ openSubscriptions = false }: { openSubscriptions?: boolean }) {
  return <div className="calendar-full-page"><CalendarWorkspace openSubscriptions={openSubscriptions} /></div>;
}
