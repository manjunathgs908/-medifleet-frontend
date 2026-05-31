// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      colors: {
        ink:     { DEFAULT: '#0a0f1e', 2: '#1a2035', 3: '#242c45' },
        surface: { DEFAULT: '#111827', 2: '#1f2937', 3: '#374151' },
        accent:  { DEFAULT: '#00d4aa', 2: '#00b896' },
        danger:  '#ff4d6d',
        warn:    '#ffb830',
        info:    '#3b9eff',
      },
      animation: {
        'fade-in'  : 'fadeIn .2s ease-out',
        'slide-up' : 'slideUp .25s ease-out',
        'pulse-dot': 'pulseDot 2s infinite',
      },
      keyframes: {
        fadeIn  : { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp : { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
      },
    },
  },
  plugins: [],
};
