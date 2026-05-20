import { describe, expect, it } from "vitest";
import { Client as SSHClient } from "ssh2";
import { getAppSetting } from "./db";

describe("FreePBX SSH Connection", () => {
  it("should have SSH credentials configured in app_settings or env", async () => {
    const host = await getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
    const user = await getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
    const pass = await getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;
    expect(host).toBeTruthy();
    expect(user).toBeTruthy();
    expect(pass).toBeTruthy();
  });

  it("should connect to FreePBX via SSH using app_settings credentials", async () => {
    const host = await getAppSetting("freepbx_host") || process.env.FREEPBX_HOST;
    const username = await getAppSetting("freepbx_ssh_user") || process.env.FREEPBX_SSH_USER;
    const password = await getAppSetting("freepbx_ssh_password") || process.env.FREEPBX_SSH_PASSWORD;

    if (!host || !username || !password) {
      console.warn("SSH credentials not available, skipping connection test");
      return;
    }

    const result = await new Promise<string>((resolve, reject) => {
      const conn = new SSHClient();
      conn.on("ready", () => {
        conn.exec("hostname", (err, stream) => {
          if (err) { conn.end(); reject(err); return; }
          let output = "";
          stream.on("data", (data: Buffer) => { output += data.toString(); });
          stream.on("close", () => { conn.end(); resolve(output.trim()); });
        });
      });
      conn.on("error", (err) => reject(err));
      conn.connect({ host, port: 22, username, password, readyTimeout: 10000 });
    });

    expect(result).toBeTruthy();
    expect(result.toLowerCase()).toContain("pbx");
  }, 15000);
});
