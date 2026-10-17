import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "~/env";
import * as schema from "~/server/db/schema";
// The preview can use a speech-only database without changing the web app's data connection.
const globalSpeech = globalThis as unknown as { speechSQL?: postgres.Sql };
const connection =
  globalSpeech.speechSQL ??
  postgres(env.NATIVE_SPEECH_DATABASE_URL ?? env.DATABASE_URL, {
    max: 3,
    connect_timeout: 10,
    idle_timeout: 20,
    connection: { statement_timeout: 15000 },
  });
if (env.NODE_ENV !== "production") globalSpeech.speechSQL = connection;
export const db = drizzle(connection, { schema });
