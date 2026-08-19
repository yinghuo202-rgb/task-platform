import type { Metadata } from "next";
import Link from "next/link";
import { Gift, ListTodo, Plus } from "lucide-react";
import { PersonalTodoList } from "@/components/personal-todo-list";
import { RewardHistory } from "@/components/reward-history";
export const metadata: Metadata = { title: "清单" };
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams;
  const view = params.view === "rewards" ? "rewards" : "lists";
  return <section className="section compact"><div className="container list-page">
    <div className="section-heading list-page-heading"><div><span className="eyebrow">LA VIE · OUR LISTS</span><h1>我们的清单</h1><p className="muted">一起做、交给彼此，也记下完成后的回礼。</p></div><Link className="button" href="/tasks/new"><Plus size={16} />发布任务</Link></div>
    <nav className="list-page-tabs" aria-label="清单页面"><Link aria-current={view === "lists" ? "page" : undefined} className={view === "lists" ? "active" : ""} href="/tasks"><ListTodo size={16} />清单</Link><Link aria-current={view === "rewards" ? "page" : undefined} className={view === "rewards" ? "active" : ""} href="/tasks?view=rewards"><Gift size={16} />收到的奖励</Link></nav>
    {view === "rewards" ? <RewardHistory embedded /> : <PersonalTodoList />}
  </div></section>;
}
