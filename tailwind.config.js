/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{ts,tsx,js,jsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        'trans-primary': '#2563eb',
        'trans-primary-light': '#60a5fa',
        'trans-bg': 'rgba(37, 99, 235, 0.05)',
        'trans-bg-hover': 'rgba(37, 99, 235, 0.1)',
        'trans-original': '#888',
        'trans-tooltip-bg': '#1f2937',
      },
    },
  },
  plugins: [],
};
