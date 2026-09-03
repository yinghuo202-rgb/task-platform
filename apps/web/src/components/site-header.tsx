"use client";

import Link from "next/link";
import { Bell, House, LogIn, PenLine, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function SiteHeader() {
  const { user, loading, logout } = useAuth();
  return <>
    <header className="site-header">
      <nav className="desktop-nav" aria-label="主导航">
        {user && <Link href="/dashboard">日历</Link>}
        {user && <Link href="/journal">手帐</Link>}
        {user && <Link href="/tasks">清单</Link>}
        {user?.role === "ADMIN" && <Link href="/admin/users">空间设置</Link>}
      </nav>
      <div className="account-nav">
        {!loading && (user
          ? <><Link className="icon-link" aria-label="消息" href="/notifications"><Bell size={18} /></Link><span className="account-name">{user.displayName}</span><button className="link-button" onClick={() => void logout()}>退出登录</button></>
          : <><Link href="/login">登录</Link><Link className="button small" href="/register">凭邀请码加入</Link></>)}
      </div>
    </header>
    <nav className="mobile-nav" aria-label="移动端导航">
      <Link href="/"><House /><span>日历</span></Link>
      <Link href={user ? "/journal" : "/login"}><PenLine /><span>手帐</span></Link>
      {user ? <Link className="mobile-primary" href="/tasks"><Sparkles /><span>清单</span></Link> : <Link className="mobile-primary" href="/login"><LogIn /><span>登录</span></Link>}
      <Link href={user ? "/notifications" : "/login"}><Bell /><span>提醒</span></Link>
    </nav>
  </>;
}
