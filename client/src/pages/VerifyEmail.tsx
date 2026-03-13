import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Radio, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token") || "";

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState("");

  const verifyMutation = trpc.localAuth.verifyEmail.useMutation({
    onSuccess: () => {
      setStatus("success");
    },
    onError: (e) => {
      setStatus("error");
      setErrorMessage(e.message);
    },
  });

  useEffect(() => {
    if (token) {
      verifyMutation.mutate({ token });
    } else {
      setStatus("error");
      setErrorMessage("No verification token provided.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Radio className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">{import.meta.env.VITE_APP_TITLE || "TTS Broadcast Dialer"}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Email Verification</CardTitle>
            <CardDescription>
              {status === "verifying" && "Verifying your email address..."}
              {status === "success" && "Your email has been verified!"}
              {status === "error" && "Verification failed"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "verifying" && (
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Please wait while we verify your email...</p>
              </div>
            )}

            {status === "success" && (
              <div className="flex flex-col items-center gap-4 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-sm text-center text-muted-foreground">
                  Your email address has been verified successfully. You can now sign in to your account.
                </p>
                <Button className="w-full" onClick={() => navigate("/login")}>
                  Go to Login
                </Button>
              </div>
            )}

            {status === "error" && (
              <div className="flex flex-col items-center gap-4 py-6">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-sm text-center text-muted-foreground">
                  {errorMessage || "The verification link is invalid or has expired."}
                </p>
                <p className="text-xs text-center text-muted-foreground">
                  Please contact your administrator to resend the verification email.
                </p>
                <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                  Back to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
