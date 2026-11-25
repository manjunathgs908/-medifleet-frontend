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
        // Same values as the CSS tokens in src/index.css (light theme).
        ink:     { DEFAULT: '#f4f6fa', 2: '#ffffff', 3: '#f8fafc' },
        surface: { DEFAULT: '#ffffff', 2: '#eef2f6', 3: '#dfe5ec' },
        accent:  { DEFAULT: '#0c6b45', 2: '#0a5a3a' },
        danger:  '#b91c1c',
        warn:    '#925300',
        info:    '#1a5ac4',
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
