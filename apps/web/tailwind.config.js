/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#FFF4EE',
          100: '#FFE4D5',
          200: '#FFC8A8',
          300: '#FFA06B',
          400: '#FF7538',
          500: '#FF5A0A',
          600: '#EB4800',
          700: '#C23D00',
          800: '#9A3100',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
