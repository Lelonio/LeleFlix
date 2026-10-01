// Configurazione Tailwind (stessa usata prima inline con il Play CDN).
// Rigenera css/tailwind.css con:  npm run build:css
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './js/player.js', './liquid-glass.js'],
    important: true,
    corePlugins: {
        backdropFilter: true,
    },
    theme: {
        extend: {
            colors: {
                primary: '#E50914',
                secondary: '#221F1F',
                accent: '#F5F5F1',
                dark: '#141414',
            },
            fontFamily: {
                sans: ['Inter', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
            },
            backdropBlur: {
                glass: '16px',
            },
            boxShadow: {
                'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.36)',
            },
            borderColor: {
                'glass': 'rgba(255, 255, 255, 0.18)',
            },
        },
    },
};
