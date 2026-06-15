/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Devin.ai-inspired dark palette.
        ink: {
          900: '#08090c', // app background
          850: '#0c0e13',
          800: '#11131a', // panels
          750: '#151823',
          700: '#1b1f2b', // raised surfaces
          600: '#232838', // borders / dividers
          500: '#2f3547',
        },
        accent: {
          DEFAULT: '#6c7bff',
          soft: '#8a96ff',
          dim: '#4b56c7',
          glow: 'rgba(108,123,255,0.25)',
        },
        teal: {
          DEFAULT: '#39d3c3',
        },
        live: {
          DEFAULT: '#ff4d6d',
          dim: '#c8324f',
        },
        text: {
          DEFAULT: '#e8eaf0',
          muted: '#9aa0b0',
          faint: '#646b7e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(108,123,255,0.4), 0 8px 30px -8px rgba(108,123,255,0.45)',
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
