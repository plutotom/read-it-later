import { describe, expect, it } from "vitest";
import { reconcileBilling } from "./reconciliation";
describe("provider aggregate reconciliation", () => {
  it("matches account/model/environment and preserves credits separately from gross differences", () => {
    const billing = [
      {
        provider: "google",
        providerAccount: "project",
        environment: "shared",
        model: "chirp3-hd",
        currency: "USD",
        gross: "0.4",
        credits: "-0.1",
        net: "0.3",
      },
      {
        provider: "google",
        providerAccount: "project",
        environment: "shared",
        model: "chirp3-hd",
        currency: "USD",
        gross: "0.1",
        credits: "0",
        net: "0.1",
      },
    ];
    const tracked = [
      {
        provider: "google",
        providerAccount: "project",
        environment: "production",
        model: "chirp3-hd",
        estimatedUsd: "0.1",
        unknownPrice: 0,
      },
      {
        provider: "google",
        providerAccount: "project",
        environment: "preview",
        model: "chirp3-hd",
        estimatedUsd: "0.2",
        unknownPrice: 0,
      },
      {
        provider: "google",
        providerAccount: "other-project",
        environment: "production",
        model: "chirp3-hd",
        estimatedUsd: "100",
        unknownPrice: 0,
      },
    ];
    expect(reconcileBilling(billing, tracked)[0]).toMatchObject({
      gross: "0.500000000000000",
      net: "0.400000000000000",
      credits: "-0.100000000000000",
      trackedEstimate: "0.300000000000000",
      grossDifference: "0.200000000000000",
    });
    expect(
      reconcileBilling([{ ...billing[0]!, currency: "EUR" }], tracked)[0]
        ?.grossDifference,
    ).toBeNull();
    expect(
      reconcileBilling(billing, [{ ...tracked[0]!, unknownPrice: 1 }])[0]
        ?.trackedEstimate,
    ).toBeNull();
  });
});
