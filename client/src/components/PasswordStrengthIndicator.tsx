import { validatePassword } from "../../../shared/passwordValidation";
import { CheckCircle2, XCircle } from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
  showRules?: boolean;
}

export function PasswordStrengthIndicator({ password, showRules = true }: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const { errors, strength } = validatePassword(password);

  const strengthColors = {
    weak: "bg-red-500",
    fair: "bg-yellow-500",
    strong: "bg-green-500",
  };

  const strengthLabels = {
    weak: "Weak",
    fair: "Fair",
    strong: "Strong",
  };

  const strengthWidth = {
    weak: "w-1/3",
    fair: "w-2/3",
    strong: "w-full",
  };

  const rules = [
    { label: "At least 8 characters", test: password.length >= 8 },
    { label: "Uppercase letter (A-Z)", test: /[A-Z]/.test(password) },
    { label: "Lowercase letter (a-z)", test: /[a-z]/.test(password) },
    { label: "Number (0-9)", test: /[0-9]/.test(password) },
    { label: "Special character (!@#$...)", test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password) },
  ];

  return (
    <div className="space-y-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${strengthColors[strength]} ${strengthWidth[strength]}`}
          />
        </div>
        <span className={`text-xs font-medium ${
          strength === "weak" ? "text-red-500" :
          strength === "fair" ? "text-yellow-600" :
          "text-green-600"
        }`}>
          {strengthLabels[strength]}
        </span>
      </div>

      {/* Rules checklist */}
      {showRules && (
        <div className="grid grid-cols-1 gap-0.5">
          {rules.map((rule) => (
            <div key={rule.label} className="flex items-center gap-1.5">
              {rule.test ? (
                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className={`text-xs ${rule.test ? "text-green-600" : "text-muted-foreground"}`}>
                {rule.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
