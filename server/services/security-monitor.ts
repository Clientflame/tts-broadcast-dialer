/**
 * Security Grade Monitor
 * 
 * Periodically checks the server's security posture and sends notifications
 * when the security grade drops. Runs every 6 hours.
 * 
 * Uses the same security checks as the setupWizard.securityStatus endpoint
 * but runs server-side on a schedule.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as db from "../db";
import { dispatchIfEnabled } from "./notification-dispatcher";

const execAsync = promisify(exec);

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastKnownGrade: string | null = null;

interface SecurityCheck {
  name: string;
  status: "ok" | "warning" | "error" | "unconfigured";
  message: string;
}

async function runCommand(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 10000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

function calculateGrade(checks: SecurityCheck[]): string {
  const total = checks.length;
  const ok = checks.filter(c => c.status === "ok").length;
  const errors = checks.filter(c => c.status === "error").length;
  const ratio = ok / total;
  if (ratio === 1) return "A";
  if (ratio >= 0.83 && errors === 0) return "B";
  if (ratio >= 0.66) return "C";
  if (ratio >= 0.5) return "D";
  return "F";
}

async function checkSecurityGrade(): Promise<{ grade: string; checks: SecurityCheck[] }> {
  const checks: SecurityCheck[] = [];

  // 1. UFW Firewall
  const ufwStatus = await runCommand("sudo ufw status 2>/dev/null | head -1");
  if (ufwStatus.includes("active")) {
    checks.push({ name: "Firewall (UFW)", status: "ok", message: "Active" });
  } else if (ufwStatus.includes("inactive")) {
    checks.push({ name: "Firewall (UFW)", status: "error", message: "Inactive" });
  } else {
    checks.push({ name: "Firewall (UFW)", status: "unconfigured", message: "Not installed" });
  }

  // 2. Fail2Ban
  const f2bStatus = await runCommand("systemctl is-active fail2ban 2>/dev/null");
  if (f2bStatus === "active") {
    checks.push({ name: "Fail2Ban (SSH)", status: "ok", message: "Running" });
  } else {
    const f2bInstalled = await runCommand("which fail2ban-server 2>/dev/null");
    checks.push({
      name: "Fail2Ban (SSH)",
      status: f2bInstalled ? "error" : "unconfigured",
      message: f2bInstalled ? "Stopped" : "Not installed",
    });
  }

  // 3. SSH Auth
  const sshConfig = await runCommand("sudo sshd -T 2>/dev/null | grep -i passwordauthentication | head -1");
  if (sshConfig.includes("no")) {
    checks.push({ name: "SSH Auth Method", status: "ok", message: "Key-only" });
  } else {
    checks.push({ name: "SSH Auth Method", status: "warning", message: "Password enabled" });
  }

  // 4. SSL/HTTPS
  const domain = process.env.DOMAIN || process.env.APP_DOMAIN;
  const protocol = process.env.APP_PROTOCOL || "http";
  if (protocol === "https" && domain) {
    checks.push({ name: "SSL/HTTPS", status: "ok", message: "Enabled" });
  } else if (domain) {
    checks.push({ name: "SSL/HTTPS", status: "warning", message: "HTTP only" });
  } else {
    checks.push({ name: "SSL/HTTPS", status: "unconfigured", message: "No domain" });
  }

  // 5. Auto Security Updates
  const unattendedStatus = await runCommand("systemctl is-active unattended-upgrades 2>/dev/null");
  if (unattendedStatus === "active") {
    checks.push({ name: "Auto Security Updates", status: "ok", message: "Enabled" });
  } else {
    checks.push({ name: "Auto Security Updates", status: "warning", message: "Disabled" });
  }

  // 6. .env File Security
  const envPerms = await runCommand("stat -c '%a' /opt/tts-dialer/.env 2>/dev/null");
  if (envPerms === "600") {
    checks.push({ name: ".env File Security", status: "ok", message: "Restricted (600)" });
  } else if (envPerms) {
    checks.push({ name: ".env File Security", status: "warning", message: `Permissions: ${envPerms}` });
  } else {
    checks.push({ name: ".env File Security", status: "unconfigured", message: "File not found" });
  }

  return { grade: calculateGrade(checks), checks };
}

async function runSecurityCheck() {
  try {
    const { grade, checks } = await checkSecurityGrade();
    
    console.log(`[SecurityMonitor] Grade: ${grade} (${checks.filter(c => c.status === "ok").length}/${checks.length} passed)`);

    // Load last known grade from app_settings if we don't have it in memory
    if (lastKnownGrade === null) {
      lastKnownGrade = await db.getAppSetting("security_last_grade") || null;
    }

    // Detect grade drop
    if (lastKnownGrade !== null && grade !== lastKnownGrade) {
      const gradeOrder = ["A", "B", "C", "D", "F"];
      const oldIndex = gradeOrder.indexOf(lastKnownGrade);
      const newIndex = gradeOrder.indexOf(grade);

      if (newIndex > oldIndex) {
        // Grade dropped
        const failedChecks = checks
          .filter(c => c.status === "error" || c.status === "warning")
          .map(c => `  - ${c.name}: ${c.message}`)
          .join("\n");

        await dispatchIfEnabled("notify_security_grade_drop", {
          title: `Security Grade Dropped: ${lastKnownGrade} → ${grade}`,
          content: `Your server's security grade has dropped from ${lastKnownGrade} to ${grade}.\n\nIssues detected:\n${failedChecks}\n\nPlease review the Security page in your dashboard to see detailed remediation steps.\n\nChecked at: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`,
        });

        console.log(`[SecurityMonitor] Grade dropped ${lastKnownGrade} → ${grade} — notification dispatched`);
      } else if (newIndex < oldIndex) {
        // Grade improved
        console.log(`[SecurityMonitor] Grade improved ${lastKnownGrade} → ${grade}`);
      }
    }

    // Persist current grade and save to history
    lastKnownGrade = grade;
    await db.upsertAppSetting("security_last_grade", grade);

    // Save to grade history table
    const okCount = checks.filter(c => c.status === "ok").length;
    const warningCount = checks.filter(c => c.status === "warning").length;
    const errorCount = checks.filter(c => c.status === "error").length;
    const unconfiguredCount = checks.filter(c => c.status === "unconfigured").length;
    try {
      await db.createSecurityGradeEntry({
        grade,
        okCount,
        warningCount,
        errorCount,
        unconfiguredCount,
        totalChecks: checks.length,
        details: checks.map(c => ({ name: c.name, status: c.status, message: c.message })),
        checkedAt: Date.now(),
      });
    } catch (histErr: any) {
      console.warn("[SecurityMonitor] Failed to save grade history:", histErr.message);
    }

  } catch (err: any) {
    console.error("[SecurityMonitor] Error running security check:", err.message);
  }
}

export function startSecurityMonitor() {
  if (intervalHandle) return;
  console.log("[SecurityMonitor] Started — checking every 6 hours for security grade changes");
  intervalHandle = setInterval(runSecurityCheck, CHECK_INTERVAL_MS);
  // Run first check after 2 minutes (give other services time to start)
  setTimeout(runSecurityCheck, 2 * 60 * 1000);
}

export function stopSecurityMonitor() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[SecurityMonitor] Stopped");
  }
}
