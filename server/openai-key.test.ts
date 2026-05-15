import { describe, it, expect } from "vitest";

describe("OpenAI API Key Validation", () => {
  it("should authenticate successfully with the configured API key", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    expect(apiKey).toBeTruthy();

    // Make a lightweight request to OpenAI to validate the key
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // 200 means valid key, 401 means invalid
    expect(response.status).toBe(200);
  });
});
