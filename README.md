This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## MCP server and data isolation

`/api/mcp` exposes the budget tools to MCP clients. One rule holds the whole
thing together: **a tool acts as the user who called it, and never as anyone
else.** Requests carry the user's OAuth access token, `createUserClient`
(`lib/supabase/mcp.ts`) attaches it to every query, and Row Level Security in
Postgres decides what comes back. Nothing in the tool bodies enforces
isolation, so nothing in them can accidentally undo it.

Three things keep that rule from eroding:

- **Only OAuth tokens are accepted.** `verifySupabaseToken` requires a
  `client_id` claim, so a web session token lifted from a browser is not a key
  to this server — every MCP client is one the user approved on the consent
  screen and can revoke under `/settings/connections`.
- **A service-role key cannot reach the tools.** ESLint fails the build if
  `app/api/mcp/**`, `lib/mcp/**` or `lib/supabase/mcp.ts` read a `SECRET` /
  `SERVICE_ROLE` env var, import an admin client, or call `createClient`
  directly. That key bypasses RLS, and its absence is what makes the rule true.
- **An isolation test asserts it end to end.** `tests/mcp-isolation.test.mts`
  drives every read tool as user A and fails if any identifier belonging to
  user B shows up in the text a tool returns.

```bash
npm test
```

The test needs two accounts that share no space; put them in `.env.test.local`
(see `.env.example`). Without them it skips rather than passing quietly. Run it
whenever a migration touches a policy — that is what usually breaks isolation.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
