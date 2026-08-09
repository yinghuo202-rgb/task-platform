import Link from "next/link";

const links = [
  ["/dashboard", "日历"],
  ["/journal", "手帐"],
  ["/tasks", "清单"],
  ["/notifications", "提醒"],
  ["/profile", "我们"],
  ["/settings/security", "空间设置"],
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <section className="section compact"><div className="container dashboard-layout"><nav className="side-nav" aria-label="工作台导航">{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav><div>{children}</div></div></section>;
}
