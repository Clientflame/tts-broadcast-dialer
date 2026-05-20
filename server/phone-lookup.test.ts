import { describe, it, expect } from "vitest";

describe("Phone Lookup API", () => {
  const BASE_URL = "http://localhost:3000";
  const API_KEY = "clq_25e0ab9fb49926a1cb702177d46e9435fb97d9974f596cd0";

  it("should return 401 without API key", async () => {
    const res = await fetch(`${BASE_URL}/api/phone-lookup?number=4074551177`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("should return 403 with invalid API key", async () => {
    const res = await fetch(`${BASE_URL}/api/phone-lookup?number=4074551177&apiKey=invalid_key`);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("should look up a phone number with valid API key (query param)", async () => {
    const res = await fetch(`${BASE_URL}/api/phone-lookup?number=4074551177&apiKey=${API_KEY}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThan(0);
    expect(data.contacts).toBeInstanceOf(Array);
    expect(data.contacts[0]).toHaveProperty("id");
    expect(data.contacts[0]).toHaveProperty("firstName");
    expect(data.contacts[0]).toHaveProperty("lastName");
    expect(data.contacts[0]).toHaveProperty("phoneNumber");
  });

  it("should look up a phone number with X-API-Key header", async () => {
    const res = await fetch(`${BASE_URL}/api/phone-lookup?number=4074551177`, {
      headers: { "X-API-Key": API_KEY },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThan(0);
  });

  it("should return empty results for non-existent number", async () => {
    const res = await fetch(`${BASE_URL}/api/phone-lookup?number=0000000000&apiKey=${API_KEY}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(0);
    expect(data.contacts).toEqual([]);
  });

  it("should export all contacts in bulk", async () => {
    const res = await fetch(`${BASE_URL}/api/phone-lookup/export?apiKey=${API_KEY}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThan(0);
    expect(data.contacts).toBeInstanceOf(Array);
    // Check format matches what auto-sync worker expects
    const contact = data.contacts[0];
    expect(contact).toHaveProperty("phone");
    expect(contact).toHaveProperty("name");
    expect(contact).toHaveProperty("id");
    expect(contact).toHaveProperty("url");
    expect(contact.url).toMatch(/^\/contacts\/\d+$/);
  });

  it("should log an inbound call", async () => {
    const res = await fetch(`${BASE_URL}/api/phone-lookup/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        phone: "4074551177",
        contactId: "120001",
        contactName: "Test Contact",
        direction: "inbound",
        timestamp: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
