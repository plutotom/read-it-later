import { createHmac, timingSafeEqual } from "node:crypto";
import { NativeLibraryError } from "./errors";

/** Cursor authentication is domain-separated from the Better Auth token MAC. */
function signature(payload: string, secret: string) {
  if (secret.length < 32) throw new Error("Cursor signing secret is required");
  return createHmac("sha256", secret)
    .update(`native-library-cursor-v1\0${payload}`)
    .digest();
}

export function signNativeLibraryCursor(
  owner: string,
  revision: string,
  secret: string,
) {
  const payload = Buffer.from(JSON.stringify([1, owner, revision])).toString(
    "base64url",
  );
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function readNativeLibraryCursor(
  cursor: string | undefined,
  owner: string,
  secret: string,
) {
  if (cursor === undefined) return "0";
  const invalid = () => new NativeLibraryError("invalid_cursor", 400);
  if (cursor.length > 2048 || !/^[\w-]+\.[\w-]+$/u.test(cursor))
    throw invalid();
  const [payload, mac] = cursor.split(".") as [string, string];
  const expected = signature(payload, secret);
  const supplied = Buffer.from(mac, "base64url");
  if (
    supplied.toString("base64url") !== mac ||
    supplied.length !== expected.length ||
    !timingSafeEqual(expected, supplied)
  )
    throw invalid();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value[0] !== 1 ||
    value[1] !== owner ||
    typeof value[2] !== "string" ||
    !/^(0|[1-9]\d{0,18})$/u.test(value[2]) ||
    BigInt(value[2]) > 9223372036854775807n
  )
    throw invalid();
  return value[2];
}
