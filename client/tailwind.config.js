/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        urgency: {
          critical: '#ef4444',
          high:     '#f97316',
          medium:   '#f59e0b',
          low:      '#3b82f6',
        },
        coc: {
          bg:     '#000000',
          card:   '#111111',
          border: '#333333',
          text:   '#ffffff',
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
