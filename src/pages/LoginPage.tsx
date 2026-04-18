import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "sonner";
import { LayoutDashboard, ShieldCheck, Zap, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const navigate = useNavigate();
  const authUserId = useAppStore((s) => s.authUserId);
  const login = useAppStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authUserId) {
      navigate("/", { replace: true });
    }
  }, [authUserId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      login(email, password);
      toast.success("Signed in");
      navigate("/", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans selection:bg-zinc-200 dark:bg-gray-950 dark:selection:bg-zinc-800 lg:flex-row lg:bg-white lg:dark:bg-black">
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-[#0088CC] to-[#00AEEF]">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-300/20 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-white/20 rounded-full blur-[100px] animate-pulse delay-700"></div>
        <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] bg-blue-400/30 rounded-full blur-[80px] animate-pulse delay-1000"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] bg-[size:20px_20px]"></div>

        <div className="relative z-10 flex flex-col justify-between p-16 w-full">
          <div>
            <div className="flex items-center space-x-3 mb-12">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                <LayoutDashboard className="text-black w-6 h-6" />
              </div>
              <span className="text-2xl font-bold text-white tracking-tight">Buildesk</span>
            </div>

            <div className="space-y-6 max-w-lg">
              <h2 className="text-5xl font-bold text-white leading-[1.1] tracking-tight">
                License & Revenue Management Platform
              </h2>
              <p className="text-xl text-blue-50/80 font-medium leading-relaxed">
                Manage customers, licenses, subscriptions, and revenue insights in one place.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 max-w-md">
            {[
              { icon: BarChart3, title: "Real-time analytics", desc: "Instantly track your core metrics." },
              { icon: ShieldCheck, title: "Secure enterprise access", desc: "Role-based access for your team." },
              { icon: Zap, title: "Scalable subscription management", desc: "Grow without friction." },
            ].map((feature, i) => (
              <div key={i} className="flex items-start space-x-4 group">
                <div className="mt-1 p-2 bg-white/15 rounded-lg group-hover:bg-white/25 transition-colors duration-300">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg">{feature.title}</h3>
                  <p className="text-blue-100/70 font-medium">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-blue-100/50 text-sm font-medium">
            &copy; {new Date().getFullYear()} Buildesk Inc. All rights reserved.
          </div>
        </div>
      </div>

      <div className="relative flex w-full flex-1 items-center justify-center bg-gray-50 p-4 dark:bg-gray-950 lg:w-1/2 lg:bg-background lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] lg:opacity-100" />

        <div className="relative z-10 w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="firstname@cravingcode.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Need an account?{" "}
            <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
