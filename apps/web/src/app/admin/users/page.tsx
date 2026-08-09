import { AdminMemberAccess } from "@/components/admin-member-access";

export default function Page() {
  return <>
    <div className="section-heading"><div><span className="eyebrow">空间设置</span><h1>空间成员</h1><p className="muted">决定谁能进入 la vie，以及能做哪些事。</p></div></div>
    <AdminMemberAccess />
  </>;
}
