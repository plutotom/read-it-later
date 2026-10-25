import { bearer } from "better-auth/plugins/bearer";

/** The native client uses the same accounts and revocable sessions as the web. */
export function nativeAuthOptions() {
  return {
    plugins: [bearer({ requireSignature: true })],
    emailAndPassword: {
      enabled: true,
      // Establish an identity with the existing social login, then add a password.
      // No unverified-email signups or implicit email-based account linking.
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
  };
}
