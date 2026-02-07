import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '2rem',
        lg: '4rem',
        xl: '5rem',
        '2xl': '6rem',
      },
    },
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        // Block type colors
        'block-ai': 'hsl(var(--color-block-ai))',
        'block-function': 'hsl(var(--color-block-function))',
        'block-router': 'hsl(var(--color-block-router))',
        'block-parallel': 'hsl(var(--color-block-parallel))',
        // Provider colors
        'provider-openai': 'hsl(var(--color-provider-openai))',
        'provider-anthropic': 'hsl(var(--color-provider-anthropic))',
        'provider-ollama': 'hsl(var(--color-provider-ollama))',
        // Semantic status colors
        'color-success': 'hsl(var(--color-success))',
        'color-warning': 'hsl(var(--color-warning))',
        'color-error': 'hsl(var(--color-error))',
        'color-info': 'hsl(var(--color-info))',
        // Streaming states
        'stream-active': 'hsl(var(--color-stream-active))',
        'stream-tool': 'hsl(var(--color-stream-tool))',
        'stream-error': 'hsl(var(--color-stream-error))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'slide-in-from-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out-to-right': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'scale-out': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        'flash-green': {
          '0%': { backgroundColor: 'rgb(34 197 94 / 0.2)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'fade-slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-from-right 200ms ease-out',
        'slide-out-right': 'slide-out-to-right 150ms ease-in',
        'fade-in': 'fade-in 150ms ease-out',
        'fade-out': 'fade-out 150ms ease-in',
        'scale-in': 'scale-in 150ms ease-out',
        'scale-out': 'scale-out 150ms ease-in',
        'flash-green': 'flash-green 500ms ease-out',
        'fade-slide-down': 'fade-slide-down 300ms ease-out',
        'fade-slide-up': 'fade-slide-up 300ms ease-out 100ms both',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
