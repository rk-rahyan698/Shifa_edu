import type { Config } from "tailwindcss";

// Scaffold only (T-001). Colour tokens, the type scale and the Bangla/English
// font stacks are added by T-002 — do not add design values here before then.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
