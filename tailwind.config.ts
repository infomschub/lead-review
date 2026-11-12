import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { brand: { DEFAULT: "#1f4fd1", dark: "#173b9e", soft: "#e8eefc" } },
    },
  },
  plugins: [],
} satisfies Config;
