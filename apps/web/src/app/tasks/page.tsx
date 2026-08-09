import { Suspense } from "react";
import type { Metadata } from "next";
import { TaskList } from "@/components/task-list";
export const metadata: Metadata = { title: "清单" };
export default function TasksPage() { return <section className="section compact"><div className="container"><div className="section-heading"><div><span className="eyebrow">LA VIE · TO DO</span><h1>我们的清单</h1><p className="muted">想做的、要记得的，都放在这里。</p></div></div><Suspense fallback={<div className="loading">正在准备清单…</div>}><TaskList /></Suspense></div></section>; }
