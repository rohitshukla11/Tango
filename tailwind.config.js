/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Neo-Brutalism Argentina Colors
        argentina: {
          blue: '#75AADB',      // Argentina light blue
          blueDark: '#5A8FC4',  // Darker blue
          white: '#FAFAFA',     // Off-white
          yellow: '#FCBF49',    // Argentina sun yellow
          yellowDark: '#E8A92A', // Darker yellow
        },
        brutal: {
          black: '#000000',     // Pure black for borders
          white: '#FFFFFF',     // Pure white
          cream: '#FFF8F0',     // Cream background
        },
        primary: {
          DEFAULT: '#75AADB',  // Argentina blue
          dark: '#5A8FC4',
          light: '#9AC4E8',
        },
        secondary: {
          DEFAULT: '#FCBF49',  // Argentina yellow
          dark: '#E8A92A',
          light: '#FFD272',
        },
        dark: {
          DEFAULT: '#000000',   // Pure black for contrast
          light: '#1A1A1A',
          lighter: '#333333',
        }
      },
      boxShadow: {
        'brutal': '6px 6px 0px 0px rgba(0,0,0,1)',
        'brutal-lg': '8px 8px 0px 0px rgba(0,0,0,1)',
        'brutal-blue': '6px 6px 0px 0px #5A8FC4',
        'brutal-yellow': '6px 6px 0px 0px #E8A92A',
        'brutal-sm': '4px 4px 0px 0px rgba(0,0,0,1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slide-up 0.5s ease-out',
        'fade-in': 'fade-in 0.3s ease-in',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(139, 92, 246, 0.5), 0 0 10px rgba(139, 92, 246, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.5)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

