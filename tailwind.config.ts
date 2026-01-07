import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          400: "#6DD3C8",
          500: "#5CBDB3",
          600: "#4AA69D",
        },
      },
    },
  },
};

export default config;
