/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef8ff',
          100: '#d9eeff',
          200: '#bce1ff',
          300: '#8ecfff',
          400: '#59b3ff',
          500: '#3391ff',
          600: '#1a6ef5',
          700: '#1358e1',
          800: '#1648b6',
          900: '#183f8f',
        },
        urgency: {
          critical: '#ef4444',
          high:     '#f97316',
          medium:   '#eab308',
          low:      '#3b82f6',
        },
        coc: {
          bg:     '#0f172a',
          card:   '#1e293b',
          border: '#334155',
          text:   '#e2e8f0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'flash': 'flash 0.8s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-dot': 'pulseDot 2s infinite',
      },
      keyframes: {
        flash: {
          '0%':   { backgroundColor: 'rgba(59, 130, 246, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        slideIn: {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
};
