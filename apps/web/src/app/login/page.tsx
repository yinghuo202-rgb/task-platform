import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
export const metadata: Metadata = { title: "登录" };
export default function LoginPage() { return <section className="section"><div className="narrow"><div className="section-heading"><div><span className="eyebrow">LA VIE · SIGN IN</span><h1>登录 la vie</h1><p className="muted">回到你们的日历、手帐和清单。</p></div></div><div className="form-card"><AuthForm mode="login" /></div></div></section>; }
