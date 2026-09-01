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
        // Semantic aliases (mirror the design tokens in index.css). Use these for
        // premium-industrial surfaces so the palette stays centralised.
        canvas: '#f7f9fc',
        surface: '#ffffff',
        ink: '#172033',
        muted: '#64748b',
        line: '#e2e8f0',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04)',
        pop: '0 4px 6px -2px rgba(16, 24, 40, 0.06), 0 12px 20px -8px rgba(16, 24, 40, 0.12)',
        dialog: '0 10px 15px -3px rgba(16, 24, 40, 0.1), 0 24px 48px -12px rgba(16, 24, 40, 0.24)',
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
