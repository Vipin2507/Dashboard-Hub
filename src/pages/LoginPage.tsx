import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
  persistRememberedCredentials,
  readRememberedCredentials,
  useAppStore,
} from "@/store/useAppStore";
import { offerSavePassword } from "@/lib/passwordCredentials";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { User } from "@/types";

/**
 * Client-side login (reliable on split hosts dashboard.buildesk.ae / api.buildesk.ae).
 * “Remember me” stores email + password locally and prefills next visit.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authUserId = useAppStore((s) => s.authUserId);
  const login = useAppStore((s) => s.login);
  const setUsers = useAppStore((s) => s.setUsers);
  const saved = readRememberedCredentials();
  const [email, setEmail] = useState(saved?.email ?? "");
  const [password, setPassword] = useState(saved?.password ?? "");
  const [rememberMe, setRememberMe] = useState(Boolean(saved?.email));
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authUserId) {
      navigate("/", { replace: true });
    }
  }, [authUserId, navigate]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (!err) return;
    if (err === "disabled") toast.error("Account is disabled");
    else if (err === "missing") toast.error("Email and password are required");
    else toast.error("Invalid email or password");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setShowPassword(false);
    setLoading(true);
    try {
      try {
        const remote = await api.get<User[]>("/users");
        if (Array.isArray(remote) && remote.length) setUsers(remote);
      } catch {
        /* keep existing store users */
      }

      login(email, password);

      if (rememberMe) {
        persistRememberedCredentials({ email, password });
        await offerSavePassword(e.currentTarget, email, password);
      } else {
        persistRememberedCredentials(null);
      }

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
    <AuthSplitLayout>
      <div className="card-soft p-5">
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Sign in</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Use your work email to continue.</p>

        <form
          id="login-form"
          method="post"
          onSubmit={handleSubmit}
          className="mt-4 space-y-2.5"
          autoComplete="on"
        >
          <div className="space-y-1">
            <Label htmlFor="username" className="mb-0">
              Email
            </Label>
            <Input
              id="username"
              name="username"
              type="email"
              autoComplete="username"
              inputMode="email"
              placeholder="firstname@cravingcode.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="mb-0">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <Checkbox
              id="remember-me"
              checked={rememberMe}
              onCheckedChange={(v) => setRememberMe(v === true)}
            />
            <Label htmlFor="remember-me" className="mb-0 cursor-pointer text-xs font-normal normal-case tracking-normal text-muted-foreground">
              Remember email &amp; password
            </Label>
          </div>
          <Button type="submit" className="h-9 w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Need an account?{" "}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
