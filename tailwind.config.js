/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#F7F8FB',
        surface: {
          primary: '#FFFFFF',
          secondary: '#FAFBFC',
        },
        border: {
          default: '#E7EAF0',
          strong: '#D8DEE8',
        },
        text: {
          primary: '#1A1D29',
          secondary: '#667085',
          muted: '#98A2B3',
        },
        accent: {
          primary: '#7C5CFC',
          hover: '#6D4EF3',
        },
        semantic: {
          success: '#72C472',
          warning: '#F4B04F',
          danger: '#E85D75',
          info: '#7BB6FF',
        }
      },
      borderRadius: {
        small: '10px',
        medium: '14px',
        large: '20px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.05)',
        hover: '0 6px 20px rgba(0,0,0,0.08)',
        drawer: '0 10px 30px rgba(0,0,0,0.10)',
        modal: '0 12px 40px rgba(0,0,0,0.12)',
      },
      zIndex: {
        grid: '0',
        blocks: '10',
        dragging: '50',
        header: '80',
        sidebar: '90',
        overlay: '190',
        drawer: '200',
        modal: '250',
        toast: '300',
      }
    },
  },
  plugins: [],
}