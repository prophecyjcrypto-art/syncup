import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        blob: {
          '0%, 100%': { opacity: '0.28', transform: 'scale(1)' },
          '50%': { opacity: '0.48', transform: 'scale(1.06)' },
        },
      },
      animation: {
        blob: 'blob 18s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
}
