import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const nextConfig = require("eslint-config-next");
const reactHooksPlugin = require("eslint-plugin-react-hooks");

// eslint-plugin-react@7 uses context.getFilename() which was removed in ESLint 9+.
// We keep @next/next, @typescript-eslint, import, jsx-a11y, and react-hooks rules.
// React component rules are already enforced by TypeScript strict mode.
const patchedConfig = nextConfig.map((config) => {
  if (!config.plugins?.react) return config;

  const otherPlugins = Object.fromEntries(
    Object.entries(config.plugins).filter(([k]) => k !== "react"),
  );
  const nonReactRules = Object.fromEntries(
    Object.entries(config.rules ?? {}).filter(([key]) => !key.startsWith("react/")),
  );

  return {
    ...config,
    plugins: {
      ...otherPlugins,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...nonReactRules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  };
});

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...patchedConfig,
  {
    settings: {
      next: { rootDir: __dirname },
    },
  },
];
