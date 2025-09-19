# Create T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

## What's next? How do I make an app with this?

We try to keep this project as simple as possible, so you can start with just the scaffolding we set up for you, and add additional things later when they become necessary.

If you are not familiar with the different technologies used in this project, please refer to the respective docs. If you still are in the wind, please join our [Discord](https://t3.gg/discord) and ask for help.

- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Drizzle](https://orm.drizzle.team) with [Neon Postgres](https://neon.tech)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC](https://trpc.io)

## Database Setup

This project uses [Drizzle ORM](https://orm.drizzle.team) with [Neon Postgres](https://neon.tech) as the database.

### Environment Variables

Create a `.env` file in the root directory and add your Neon database URL:

```env
DATABASE_URL="postgres://username:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

### Database Migrations

Generate migrations:

```bash
pnpm db:generate
```

Run migrations:

```bash
pnpm db:migrate
```

Or push schema changes directly (for development):

```bash
pnpm db:push
```

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.
