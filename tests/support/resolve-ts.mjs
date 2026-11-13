// Lets `pnpm test` import the app's TypeScript modules as Next.js resolves them: the `@/` alias for `src/`, and
// relative imports written without an extension (`./case-api` → `./case-api.ts`). Node strips the types itself
// (--experimental-strip-types); this only finds the files. Loaded with `node --import` in package.json's test script.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../../src/", import.meta.url);
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = specifier.startsWith("@/")
      ? new URL(specifier.slice(2), SRC)
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:")
        ? new URL(specifier, context.parentURL)
        : null;
    if (url && !existsSync(fileURLToPath(url))) {
      const found = EXTENSIONS.map((ext) => new URL(url.href + ext)).find((u) => existsSync(fileURLToPath(u)));
      if (found) return nextResolve(found.href, context);
    }
    return nextResolve(url ? url.href : specifier, context);
  },
});
