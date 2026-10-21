import { describe, expect, it } from "vitest";
import { prepareBillingImport } from "./audio-billing.mjs";
const row = {
  provider: "google",
  providerAccount: "project-a",
  environment: "shared",
  period: "2026-10",
  invoiceMonth: "2026-11",
  sku: "F977-2280-6F1B",
  model: "chirp3-hd",
  currency: "USD",
  gross: "0.000000123456789",
  credits: "-0.000000023456789",
  net: "0.000000100000000",
};
describe("billing reconciliation import", () => {
  it("uses stable slices for late invoice adjustments and exact decimals", () => {
    const first = prepareBillingImport({
      source: "billing-export",
      rows: [row],
    });
    const changed = prepareBillingImport({
      source: "billing-export",
      rows: [{ ...row, gross: "1", credits: "0", net: "1" }],
    });
    expect(first.rows[0]!.id).toBe(changed.rows[0]!.id);
    expect(first.rows[0]!.invoiceMonth).toBe("2026-11");
  });
  it("rejects bad totals, duplicate slices, and invalid accounting windows", () => {
    expect(() =>
      prepareBillingImport({ source: "x", rows: [{ ...row, net: "1" }] }),
    ).toThrow();
    expect(() =>
      prepareBillingImport({ source: "x", rows: [row, row] }),
    ).toThrow();
    expect(() =>
      prepareBillingImport({
        source: "x",
        rows: [{ ...row, period: "2026-13" }],
      }),
    ).toThrow();
  });
});
