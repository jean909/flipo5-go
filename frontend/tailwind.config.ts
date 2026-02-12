import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-syne)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* Tema centralizată – folosește aceste clase în loc de culori hardcodate */
        theme: {
          bg: 'var(--theme-bg)',
          'bg-elevated': 'var(--theme-bg-elevated)',
          'bg-subtle': 'rgb(var(--theme-white-rgb) / 0.05)',
          'bg-hover': 'rgb(var(--theme-white-rgb) / 0.1)',
          'bg-hover-strong': 'rgb(var(--theme-white-rgb) / 0.2)',
          'bg-hover-stronger': 'rgb(var(--theme-white-rgb) / 0.3)',
          'bg-overlay': 'rgb(var(--theme-bg-rgb) / 0.7)',
          'bg-overlay-strong': 'rgb(var(--theme-bg-rgb) / 0.9)',
          fg: '#ffffff',
          'fg-muted': 'var(--theme-fg-muted)',
          'fg-subtle': 'var(--theme-fg-subtle)',
          border: 'rgb(var(--theme-white-rgb) / 0.2)',
          'border-hover': 'rgb(var(--theme-white-rgb) / 0.3)',
          'border-subtle': 'rgb(var(--theme-white-rgb) / 0.1)',
          'border-strong': 'rgb(var(--theme-white-rgb) / 0.4)',
          accent: {
            DEFAULT: 'var(--theme-accent)',
            muted: 'rgb(var(--theme-accent-rgb) / 0.2)',
            border: 'rgb(var(--theme-accent-rgb) / 0.4)',
            hover: 'rgb(var(--theme-accent-rgb) / 0.3)',
          },
          success: {
            DEFAULT: 'var(--theme-success)',
            muted: 'rgb(var(--theme-success-rgb) / 0.2)',
          },
          danger: {
            DEFAULT: 'var(--theme-danger)',
            muted: 'rgb(var(--theme-danger-rgb) / 0.2)',
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;
