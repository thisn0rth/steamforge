/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral broadcast-dark palette.
        ink: {
          900: '#141414', // app background
          850: '#171717',
          800: '#191919', // panels / lighter background
          750: '#1f1f1f', // raised surfaces
          700: '#242424',
          600: '#2a2a2a', // borders / dividers
          500: '#3a3a3a',
        },
        accent: {
          DEFAULT: '#f2f2f2',
          soft: '#ffffff',
          dim: '#9a9a9a',
          glow: 'rgba(255,255,255,0.16)',
        },
        teal: {
          DEFAULT: '#2dd4a7',
        },
        // On-air / program.
        live: {
          DEFAULT: '#ff3b46',
          dim: '#c8323c',
        },
        // Preview / staged.
        preview: {
          DEFAULT: '#2dd4a7',
          dim: '#1f9c7b',
        },
        text: {
          DEFAULT: '#ededed',
          muted: '#a3a3a3',
          faint: '#6b6b6b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.18), 0 8px 30px -8px rgba(0,0,0,0.7)',
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        onair: '0 0 0 1px rgba(255,59,70,0.5), 0 0 30px -6px rgba(255,59,70,0.45)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
