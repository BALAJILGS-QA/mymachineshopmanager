/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Apple-green brand — drives the whole app (buttons, active nav,
        // focus rings) plus the marketing site accents.
        brand: {
          50: '#f5fbe7',
          100: '#e8f6c6',
          200: '#d3ec97',
          300: '#bbe063',
          400: '#a4d13a',
          500: '#8db600',
          600: '#739400',
          700: '#587200',
          800: '#465a09',
          900: '#3a4b10',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
}
