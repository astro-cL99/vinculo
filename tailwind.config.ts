// Tailwind v4 no requiere este archivo — la configuración vive en src/styles.css
// vía @import "tailwindcss" y @theme. Este stub existe solo para silenciar
// el warning del generador de tailwind.config.lov.json.
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;
