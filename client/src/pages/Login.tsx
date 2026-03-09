import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useState } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { Phone, Mail, Lock, ArrowRight, Radio } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetEmail, setResetEmail] = useState("");

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: () => {
      toast.success("Login successful");
      navigate("/");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetMutation = trpc.localAuth.resetPasswordRequest.useMutation({
    onSuccess: () => {
      toast.success("If that email exists, a reset link has been sent");
      setMode("login");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate({ email, password });
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    resetMutation.mutate({ email: resetEmail });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo/Brand */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Radio className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">TTS Broadcast Dialer</h1>
          <p className="text-muted-foreground">AI-powered voice broadcast platform</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{mode === "login" ? "Sign In" : "Reset Password"}</CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Enter your credentials to access the dashboard"
                : "Enter your email to receive a password reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      className="pl-9"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setMode("reset")}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      className="pl-9"
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Signing in..." : <>Sign In <ArrowRight className="h-4 w-4 ml-2" /></>}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <Label htmlFor="reset-email">Email Address</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
                  {resetMutation.isPending ? "Sending..." : "Send Reset Link"}
                </Button>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline w-full text-center"
                  onClick={() => setMode("login")}
                >
                  Back to login
                </button>
              </form>
            )}

            {mode === "login" && (
              <>
                <div className="relative">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                    or continue with
                  </span>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { window.location.href = getLoginUrl(); }}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Sign in with Manus OAuth
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Secure access to your broadcast dialer platform
        </p>
      </div>
    </div>
  );
}
