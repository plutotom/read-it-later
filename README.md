# Read It Later

A modern "read it later" application built with the T3 Stack and Shadcn UI.

## Features

- Save articles from URLs for later reading
- Clean, mobile-optimized reading experience
- Search and filter saved articles
- Modern UI with Shadcn UI components
- Type-safe with TypeScript throughout

## Tech Stack

- [Next.js](https://nextjs.org) - React framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [Shadcn UI](https://ui.shadcn.com/) - Component library
- [Drizzle ORM](https://orm.drizzle.team) - Database ORM
- [tRPC](https://trpc.io) - Type-safe APIs
- [BetterAuth](https://www.better-auth.com/) - Authentication

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up your database:

   ```bash
   pnpm db:push
   ```

3. Run the development server:

   ```bash
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Shadcn UI Components

This project includes a comprehensive set of Shadcn UI components:

- **Form Elements**: Button, Input, Textarea, Select, Checkbox, Switch, Label
- **Layout**: Card, Separator, Dialog, Dropdown Menu, Tooltip
- **Feedback**: Alert, Badge, Toast
- **Navigation**: Various interactive components

Visit `/components` to see all available components in action.

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm lint` - Run ESLint
- `pnpm db:push` - Push database schema changes
- `pnpm db:studio` - Open Drizzle Studio

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.
