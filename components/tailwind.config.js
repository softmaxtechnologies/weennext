/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // REQUIRED for the dark/light toggle to work
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
