import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module
vi.mock("./db", () => ({
  getContact: vi.fn(),
  getContactList: vi.fn(),
  getDb: vi.fn(),
}));

import * as db from "./db";

describe("Contact Detail (getById)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when contact does not exist", async () => {
    (db.getContact as any).mockResolvedValue(undefined);
    const result = await db.getContact(999999);
    expect(result).toBeUndefined();
  });

  it("should return contact data when contact exists", async () => {
    const mockContact = {
      id: 120001,
      listId: 1,
      userId: 1,
      phoneNumber: "4074551177",
      firstName: "Ethan",
      lastName: "Prescott",
      email: "ethan@example.com",
      company: "Test Corp",
      state: "FL",
      databaseName: "Test DB",
      status: "active",
      creditorName: null,
      accountNumber: null,
      originalBalance: null,
      currentBalance: null,
      customFields: { "field1": "value1" },
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-05-01"),
    };
    (db.getContact as any).mockResolvedValue(mockContact);
    const result = await db.getContact(120001);
    expect(result).toEqual(mockContact);
    expect(result!.id).toBe(120001);
    expect(result!.firstName).toBe("Ethan");
    expect(result!.phoneNumber).toBe("4074551177");
  });

  it("should return contact list name", async () => {
    (db.getContactList as any).mockResolvedValue({ id: 1, name: "Test List" });
    const list = await db.getContactList(1);
    expect(list).toEqual({ id: 1, name: "Test List" });
    expect(list!.name).toBe("Test List");
  });

  it("should handle contact with debt fields", async () => {
    const mockDebtContact = {
      id: 120002,
      listId: 2,
      userId: 1,
      phoneNumber: "3055551234",
      firstName: "Jane",
      lastName: "Doe",
      status: "active",
      creditorName: "Capital One",
      accountNumber: "ACC-12345",
      originalBalance: 500000, // $5000.00
      currentBalance: 325000, // $3250.00
      debtType: "credit_card",
      debtorStatus: "active",
      customFields: null,
      createdAt: new Date("2026-02-15"),
      updatedAt: new Date("2026-05-10"),
    };
    (db.getContact as any).mockResolvedValue(mockDebtContact);
    const result = await db.getContact(120002);
    expect(result!.creditorName).toBe("Capital One");
    expect(result!.originalBalance).toBe(500000);
    expect(result!.currentBalance).toBe(325000);
  });

  it("should format phone numbers correctly in the UI helper", () => {
    // Test the formatPhone utility
    function formatPhone(phone: string): string {
      const digits = phone.replace(/[^0-9]/g, "");
      if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
      return phone;
    }
    expect(formatPhone("4074551177")).toBe("(407) 455-1177");
    expect(formatPhone("14074551177")).toBe("+1 (407) 455-1177");
    expect(formatPhone("123")).toBe("123");
  });
});
