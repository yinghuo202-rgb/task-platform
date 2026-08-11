import { NotificationsList } from "@/components/notifications-list";
export default function Page() { return <section className="section compact"><div className="container"><div className="section-heading"><div><span className="eyebrow">消息</span><h1>提醒</h1><p className="muted">新任务、手帐更新和需要回应的协作进展都会出现在这里。</p></div></div><NotificationsList /></div></section>; }
