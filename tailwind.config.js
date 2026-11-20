/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Secondary text: Tailwind's default neutral-500 (#737373) is only ~4.3:1 on the app's off-white
        // surfaces. #666666 gives >= 5.2:1 on #F4F4F2 / #F7F5F0 and 5.7:1 on white (WCAG AA).
        neutral: { 500: '#666666' }
      },
      fontFamily: {
        // Editorial serif for the marketing pages only (the app keeps Inter).
        display: ['Fraunces', 'Georgia', 'Cambria', 'Times New Roman', 'serif']
      }
    }
  },
  plugins: []
};
