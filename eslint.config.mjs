import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Everything the MCP server touches. Isolation between users is enforced by
// RLS, and RLS only applies when the request carries the user's own token, so
// these files must never be able to reach a credential that bypasses it.
const MCP_FILES = ["app/api/mcp/**", "lib/mcp/**", "lib/supabase/mcp.ts"];

const SECRET_ENV = /SECRET|SERVICE_ROLE/;

const noSecretEnv = [
  {
    // process.env.SUPABASE_SECRET_KEY
    selector: `MemberExpression[object.object.name='process'][object.property.name='env'][property.name=${SECRET_ENV}]`,
    message:
      "MCP tools act as the calling user. A secret/service-role key bypasses RLS and would return every user's rows.",
  },
  {
    // process.env["SUPABASE_SECRET_KEY"]
    selector: `MemberExpression[object.object.name='process'][object.property.name='env'][property.value=${SECRET_ENV}]`,
    message:
      "MCP tools act as the calling user. A secret/service-role key bypasses RLS and would return every user's rows.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: MCP_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...noSecretEnv],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/supabase/admin", "@/lib/supabase/admin"],
              message:
                "The admin client bypasses RLS. Anything that needs it (audit writes, back-office) lives outside the MCP request path.",
            },
          ],
        },
      ],
    },
  },
  {
    // lib/supabase/mcp.ts is the one sanctioned place that builds a client, and
    // it builds it from the publishable key plus the caller's bearer token.
    files: ["app/api/mcp/**", "lib/mcp/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              importNames: ["createClient"],
              message: "Use createUserClient from @/lib/supabase/mcp — it binds the request to the caller's token.",
            },
          ],
          patterns: [
            {
              group: ["**/supabase/admin", "@/lib/supabase/admin"],
              message:
                "The admin client bypasses RLS. Anything that needs it (audit writes, back-office) lives outside the MCP request path.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
