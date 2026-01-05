/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        primary: '#2563eb',
        surface: '#f8fafc',
      },
      boxShadow: {
        soft: '0 6px 24px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
