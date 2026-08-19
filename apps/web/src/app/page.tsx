"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Heart, PenLine } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DashboardSummary } from "@/components/dashboard-summary";

export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">正在进入工作空间…</div>;

  if (!user) return <>
    <section className="hero"><div className="container hero-shell"><div className="hero-grid">
      <div className="hero-copy">
        <span className="eyebrow">LA VIE · OUR LITTLE SPACE</span>
        <h1>把日子一起<br />过好。</h1>
        <p>安排时间、写下手帐、记住那些值得重看的瞬间。</p>
        <div className="button-row"><Link className="button" href="/login">进入 la vie <ArrowRight size={18} /></Link><Link className="button secondary" href="/register">凭邀请码加入</Link></div>
        <div className="hero-principles"><span><CalendarDays size={15} />日程放在一起</span><span><PenLine size={15} />手帐在线保存</span><span><Heart size={15} />只和对方分享</span></div>
      </div>
      <aside className="hero-panel" aria-label="la vie 功能预览">
        <div className="hero-panel-head"><div><strong>今天，也留一点位置</strong><p>日程、手帐和想一起做的事情。</p></div><span className="badge">私密空间</span></div>
        <div className="hero-brief"><span className="brief-icon yellow"><CalendarDays size={17} /></span><div><strong>日历</strong><p>拖动安排时间，月、周、日都能看。</p></div></div>
        <div className="hero-brief"><span className="brief-icon mint"><PenLine size={17} /></span><div><strong>手帐</strong><p>写下今天，之后可以从历史时间轴找回来。</p></div></div>
        <div className="hero-brief"><span className="brief-icon pink"><Heart size={17} /></span><div><strong>私密</strong><p>只在两个人之间共享，不公开发布。</p></div></div>
        <div className="hero-panel-note"><Check size={15} /> 内容在线保存，NAS 负责备份。</div>
      </aside>
    </div></div></section>
  </>;
  return <DashboardSummary />;
}
