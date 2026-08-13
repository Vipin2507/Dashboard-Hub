import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BarChart3, ShieldCheck, Zap } from "lucide-react";

const FEATURES = [
  { icon: BarChart3, title: "Real-time analytics", desc: "Instantly track your core metrics." },
  { icon: ShieldCheck, title: "Secure enterprise access", desc: "Role-based access for your team." },
  { icon: Zap, title: "Scalable subscription management", desc: "Grow without friction." },
] as const;

export function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-split flex min-h-screen min-h-[100dvh] flex-col bg-background lg:flex-row">
      <aside className="auth-panel relative hidden w-[min(42%,28rem)] shrink-0 flex-col justify-between overflow-hidden border-r px-8 py-8 lg:flex xl:w-[26rem] xl:px-9">
        <div className="relative z-10">
          <div className="mb-8 flex items-center gap-2">
            <BrandMark glow />
            <span className="text-[13px] font-semibold tracking-tight">Buildesk</span>
          </div>
          <p className="max-w-[17rem] text-lg font-semibold leading-snug tracking-tight">
            License &amp; Revenue Management Platform
          </p>
          <p className="auth-panel-muted mt-2 max-w-[17rem] text-xs leading-relaxed">
            Manage customers, licenses, subscriptions, and revenue insights in one place.
          </p>
        </div>

        <ul className="relative z-10 space-y-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-2.5">
              <span className="auth-panel-tile mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[13px] font-medium leading-tight">{title}</p>
                <p className="auth-panel-muted mt-0.5 text-[11px] leading-snug">{desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="auth-panel-muted relative z-10 text-[10px]">
          &copy; {new Date().getFullYear()} Buildesk Inc. All rights reserved.
        </p>
      </aside>

      <div className="relative flex min-w-0 flex-1 items-center justify-center bg-background p-4 lg:p-6">
        <div className="absolute right-3 top-3 z-10">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[22rem]">
          <div className="mb-4 flex items-center gap-2 lg:hidden">
            <BrandMark glow />
            <span className="text-[13px] font-semibold tracking-tight">Buildesk</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
