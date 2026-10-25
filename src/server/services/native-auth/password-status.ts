import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "~/server/db";
import { account } from "~/schemas/auth";

/** Only return whether a credential exists; never load its password hash. */
export async function hasAccountPassword(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password),
        ne(account.password, ""),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
