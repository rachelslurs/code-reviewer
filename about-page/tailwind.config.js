/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          '50': '#ecfffe',
          '100': '#d5fdfd',
          '200': '#a7f8fa',
          '300': '#6bf1f5',
          '400': '#27e0e9',
          '500': '#0bc3cf',
          '600': '#0c9cae',
          '700': '#117d8d',
          '800': '#186572',
          '900': '#185361',
          '950': '#0a3742',
      },
      secondary: {
          50: '#effaf5',
          100: '#d9f2e6',
          200: '#b5e5d1',
          300: '#85d0b5',
          400: '#52b594',
          500: '#30997a',
          600: '#207b62',
          700: '#1a6251',
          800: '#195647',
          900: '#144037',
          950: '#0a241f',
        },
        accent: {
          '50': '#fff4f1',
          '100': '#ffe8e1',
          '200': '#ffd4c8',
          '300': '#ffb6a1',
          '400': '#fe977a',
          '500': '#f6663d',
          '600': '#e44a1e',
          '700': '#c03b15',
          '800': '#9e3416',
          '900': '#833019',
          '950': '#481507',
        },
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}

