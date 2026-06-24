# Read It Later

A modern "read it later" application built with the T3 Stack and Shadcn UI.

<!-- TODO make db items bound to user id on create, read, update, etc. -->
<!-- TODO validate loged in user gets redirected propperly. need to check what happens on cached instances. -->

## Features

- Save articles from URLs for later reading
- Clean, mobile-optimized reading experience
- Search and filter saved articles
- Modern UI with Shadcn UI components
- Type-safe with TypeScript throughout

## Highlighting (in progress)

Text highlighting on articles is being rebuilt. The data layer and the
create→paint pipeline are done; interaction polish remains.

Anchoring uses the W3C Web Annotation model: a TextPosition selector
(`startOffset`/`endOffset` into the article's `textContent`) for the fast path,
plus a TextQuote selector (exact `text` + `contextPrefix`/`contextSuffix`) to
re-anchor when content drifts. Highlights are painted with the CSS Custom
Highlight API (no DOM mutation). See `src/lib/highlight-anchor.ts`,
`src/hooks/use-highlights.ts`, and `src/hooks/use-highlight-painter.ts`.

**Done**

- [x] Schema/service/API: cascade FKs, `version`, `anchorContentHash`,
      `anchorStatus`; notes moved to the `notes` table as the single source of truth
- [x] Anchoring contract (`selectionToAnchor` / `resolveHighlight`) with tests
- [x] Optimistic highlights data hook
- [x] CSS Custom Highlight API painter (re-resolves on content/list change)
- [x] Selection toolbar to create highlights by color

**Remaining**

- [ ] Click a highlight → popover/sheet to change color, delete, and add a note
- [ ] Notes UI wired through the existing `notes` endpoints
- [ ] Side panel listing highlights, including a "lost highlights" section for
      highlights with `anchorStatus: 'lost'`
- [ ] Mobile bottom-sheet variants for the selection toolbar and highlight actions
- [ ] End-to-end visual verification in the running app

> Note: run `pnpm db:push` to apply the highlight/notes schema changes (this
> drops the old `highlights.note` column).

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
