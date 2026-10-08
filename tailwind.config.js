/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0e7490', strong: '#0b5c72', tint: '#e6f4f7' },
        ink: { DEFAULT: '#0f1e26', 2: '#3b4a54' },
        muted: { DEFAULT: '#5b6b76', 2: '#87949d' },
        surface: { DEFAULT: '#ffffff', 2: '#f6f8fa' },
        line: '#e3e9ee',
        bg: '#eef2f5',
        ok: { DEFAULT: '#0f7a52', bg: '#dcf4e8', line: '#b6e6cf' },
        warn: { DEFAULT: '#a85a06', bg: '#fdeccd', line: '#f3d089' },
        crit: { DEFAULT: '#b3261e', bg: '#fde5e2', line: '#f5c0ba' },
        neut: { DEFAULT: '#586873', bg: '#eef2f5', line: '#dbe3e9' },
      },
      borderRadius: {
        DEFAULT: '14px',
        sm: '9px',
      },
      fontFamily: {
        heading: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
