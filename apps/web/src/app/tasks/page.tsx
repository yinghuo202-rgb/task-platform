import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PersonalTodoList } from "@/components/personal-todo-list";
export const metadata: Metadata = { title: "清单" };
export default function TasksPage() { return <section className="section compact"><div className="container list-page"><div className="section-heading list-page-heading"><div><span className="eyebrow">LA VIE · OUR LISTS</span><h1>我们的清单</h1><p className="muted">愿望一起完成，任务交给彼此。</p></div><Link className="button" href="/tasks/new"><Plus size={16} />发布任务</Link></div><PersonalTodoList /></div></section>; }
