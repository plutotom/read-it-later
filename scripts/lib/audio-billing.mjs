import { createHash } from "node:crypto";
import { z } from "zod";
const decimal = z.string().regex(/^-?\d{1,14}(\.\d{1,15})?$/);
export const billingImportSchema = z.object({
  source: z.string().min(1).max(100),
  rows: z
    .array(
      z.object({
        provider: z.enum(["google", "speechify", "inworld"]),
        providerAccount: z.string().min(1).max(100),
        environment: z.enum(["production", "preview", "development", "shared"]),
        period: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
        invoiceMonth: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
        sku: z.string().min(1).max(160),
        model: z.string().min(1).max(100),
        currency: z.string().regex(/^[A-Z]{3}$/),
        gross: decimal,
        credits: decimal,
        net: decimal,
      }),
    )
    .min(1)
    .max(10000),
});
/** @param {string} value */
export function decimalUnits(value) {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return (negative ? -1n : 1n) * BigInt(whole + fraction.padEnd(15, "0"));
}
/** @param {unknown} input */
export function prepareBillingImport(input) {
  const parsed = billingImportSchema.parse(input),
    seen = new Set();
  const rows = parsed.rows.map((row) => {
    if (
      decimalUnits(row.gross) + decimalUnits(row.credits) !==
      decimalUnits(row.net)
    )
      throw new Error("Billing gross plus signed credits must equal net");
    const id = createHash("sha256")
      .update(
        JSON.stringify([
          row.provider,
          row.providerAccount,
          row.environment,
          row.period,
          row.invoiceMonth,
          row.sku,
          row.model,
          row.currency,
        ]),
      )
      .digest("hex");
    if (seen.has(id))
      throw new Error(
        "Duplicate billing slice: supply one aggregate per account/environment/month/SKU/currency",
      );
    seen.add(id);
    return { ...row, id };
  });
  return { source: parsed.source, rows };
}
