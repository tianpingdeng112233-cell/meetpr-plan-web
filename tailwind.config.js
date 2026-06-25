/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand-red)',
          press: 'var(--brand-red-press)',
          soft: 'var(--brand-red-soft)',
        },
        green: { DEFAULT: 'var(--green)', soft: 'var(--green-soft)' },
        amber: { DEFAULT: 'var(--amber)', soft: 'var(--amber-soft)' },
        bg: 'var(--bg)',
        s1: 'var(--surface-1)',
        s2: 'var(--surface-2)',
        s3: 'var(--surface-3)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        fg: {
          DEFAULT: 'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          tertiary: 'var(--fg-tertiary)',
          disabled: 'var(--fg-disabled)',
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
        display: 'var(--font-display)',
      },
      borderRadius: {
        sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)', pill: 'var(--r-pill)',
      },
    },
  },
  plugins: [],
}
