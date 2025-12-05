# Better Auth with Discord - Setup Guide

This guide will help you complete the setup of Discord authentication using Better Auth.

## Prerequisites

1. A Discord application created in the [Discord Developer Portal](https://discord.com/developers/applications)

## Step 1: Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Give it a name (e.g., "Read It Later")
4. Go to the "OAuth2" section
5. Add a redirect URI:
   - **Development**: `http://localhost:3000/api/auth/callback/discord`
   - **Production**: `https://yourdomain.com/api/auth/callback/discord`
6. Copy the **Client ID** and **Client Secret**

## Step 2: Environment Variables

Create a `.env` file in the project root (or update your existing one) with the following variables:

```env
# Database (existing)
DATABASE_URL="postgresql://user:password@localhost:5432/read-it-later"

# Better Auth
AUTH_SECRET="your-auth-secret-here-generate-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"

# Discord OAuth
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"

# Optional: For client-side auth (if different from AUTH_URL)
NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
```

### Generating AUTH_SECRET

Run this command to generate a secure secret:

```bash
openssl rand -base64 32
```

Or use an online generator, but make sure it's at least 32 characters long.

## Step 3: Run Database Migrations

Better Auth will create its own tables. Run the migrations:

```bash
pnpm db:push
```

Or if you prefer to generate migration files:

```bash
pnpm db:generate
pnpm db:migrate
```

## Step 4: Start the Development Server

```bash
pnpm dev
```

## Step 5: Test Authentication

1. Navigate to http://localhost:3000
2. You should be redirected to `/login`
3. Click "Sign in with Discord"
4. Authorize the application in Discord
5. You should be redirected back to the home page

## What's Been Implemented

### Server-Side
- ✅ Better Auth server configuration with Discord provider
- ✅ Drizzle ORM adapter for PostgreSQL
- ✅ Next.js API route handler at `/api/auth/[...auth]`
- ✅ tRPC context includes session
- ✅ Protected procedure for authenticated routes
- ✅ Middleware to protect routes and redirect to login

### Client-Side
- ✅ Auth client utilities (`src/lib/auth-client.ts`)
- ✅ Login page at `/login`
- ✅ Sign out button in navigation
- ✅ Session display in navigation header

### Files Created/Modified
- `src/server/auth.ts` - Better Auth server configuration
- `src/app/api/auth/[...auth]/route.ts` - Auth API routes
- `src/lib/auth-client.ts` - Client-side auth utilities
- `src/app/login/page.tsx` - Login page
- `src/middleware.ts` - Route protection middleware
- `src/server/api/trpc.ts` - Updated with session and protected procedure
- `src/app/_components/DesktopNav.tsx` - Added sign out button
- `src/env.js` - Added auth environment variables

## Next Steps

1. **Update Database Schema**: See `DATABASE_CHANGES_FOR_AUTH.md` for required schema changes to bind data to users
2. **Update tRPC Routers**: Change `publicProcedure` to `protectedProcedure` and add user filtering
3. **Test the Flow**: Make sure authentication works end-to-end
4. **Deploy**: Update Discord OAuth redirect URI for production

## Troubleshooting

### "Invalid redirect URI" error
- Make sure the redirect URI in Discord Developer Portal exactly matches: `http://localhost:3000/api/auth/callback/discord`
- Check that `AUTH_URL` in your `.env` matches your app URL

### Session not persisting
- Check that `AUTH_SECRET` is set and consistent
- Verify cookies are being set in browser dev tools

### Database errors
- Make sure Better Auth migrations have run
- Check that `DATABASE_URL` is correct

## Security Notes

- Never commit `.env` file to version control
- Use strong, random `AUTH_SECRET` values
- Keep `DISCORD_CLIENT_SECRET` secure
- In production, use HTTPS for all auth flows

