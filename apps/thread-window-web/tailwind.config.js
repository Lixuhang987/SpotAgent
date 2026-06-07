/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B0B0F',
        surface: 'rgba(255, 255, 255, 0.04)',
        border: 'rgba(255, 255, 255, 0.08)',
        'text-primary': '#F2F2F5',
        'text-secondary': '#9A9AA8',
        accent: {
          DEFAULT: '#FFA947',
          hover: '#FF9420',
          pressed: '#E07F0A',
          subtle: 'rgba(255, 169, 71, 0.14)',
          ring: 'rgba(255, 169, 71, 0.40)',
        },
        error: '#FF5E5E',
        'user-bubble': 'rgba(255, 169, 71, 0.12)',
        'assistant-bubble': 'rgba(255, 255, 255, 0.04)',
        'tool-bubble': 'rgba(255, 255, 255, 0.06)',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        xxl: '24px',
      },
      borderRadius: {
        panel: '12px',
        bubble: '8px',
      },
    },
  },
  plugins: [],
};
