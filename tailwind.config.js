/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Editorial serif for the marketing pages only (the app keeps Inter).
        display: ['Fraunces', 'Georgia', 'Cambria', 'Times New Roman', 'serif']
      }
    }
  },
  plugins: []
};
