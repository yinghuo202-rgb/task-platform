import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <section className="section compact"><div className="container dashboard-layout"><nav className="side-nav" aria-label="空间管理导航"><Link href="/admin">空间概览</Link><Link href="/admin/users">成员</Link><Link href="/admin/tasks">清单管理</Link><Link href="/admin/audit-logs">操作记录</Link></nav><div>{children}</div></div></section>;
}
