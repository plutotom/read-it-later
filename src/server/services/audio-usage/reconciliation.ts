/** Aggregate billing is reconcilable; assigning shared credits to individual users is not. */
export function moneyUnits(value: string) {
  if (!/^-?\d+(\.\d{1,15})?$/.test(value))
    throw new Error("Invalid monetary decimal");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return (
    BigInt(whole! + fraction.padEnd(15, "0")) *
    (value.startsWith("-") ? -1n : 1n)
  );
}
export function moneyDecimal(value: bigint) {
  const digits = (value < 0n ? -value : value).toString().padStart(16, "0");
  return (
    (value < 0n ? "-" : "") + digits.slice(0, -15) + "." + digits.slice(-15)
  );
}
type BillingSlice = {
  provider: string;
  providerAccount: string;
  environment: string;
  model: string;
  currency: string;
  gross: string;
  credits: string;
  net: string;
};
type TrackedSlice = {
  provider: string;
  providerAccount: string;
  environment: string;
  model: string;
  estimatedUsd: string;
  unknownPrice: number;
};
export function reconcileBilling(
  billing: BillingSlice[],
  tracked: TrackedSlice[],
) {
  const groups = new Map<string, BillingSlice>();
  for (const row of billing) {
    const key = JSON.stringify([
      row.provider,
      row.providerAccount,
      row.environment,
      row.model,
      row.currency,
    ]);
    const current = groups.get(key);
    groups.set(
      key,
      current
        ? {
            ...row,
            gross: moneyDecimal(
              moneyUnits(current.gross) + moneyUnits(row.gross),
            ),
            credits: moneyDecimal(
              moneyUnits(current.credits) + moneyUnits(row.credits),
            ),
            net: moneyDecimal(moneyUnits(current.net) + moneyUnits(row.net)),
          }
        : { ...row },
    );
  }
  return [...groups.values()].map((row) => {
    const matched = tracked.filter(
      (t) =>
        t.provider === row.provider &&
        t.providerAccount === row.providerAccount &&
        t.model === row.model &&
        (row.environment === "shared" || t.environment === row.environment),
    );
    const known =
      row.currency === "USD" && matched.every((t) => t.unknownPrice === 0);
    const estimate = matched.reduce(
      (sum, t) => sum + moneyUnits(t.estimatedUsd),
      0n,
    );
    return {
      ...row,
      trackedEstimate: known ? moneyDecimal(estimate) : null,
      grossDifference: known
        ? moneyDecimal(moneyUnits(row.gross) - estimate)
        : null,
    };
  });
}
