/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './constants.ts',
    './types.ts',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}'
  ],
  // Classes below are assembled at runtime (string .replace on a literal class),
  // so the content scanner cannot find them in source. Keep in sync with:
  //   components/ProgressBar.tsx    colorClass.replace('text-', 'bg-')
  //   components/ComboIndicator.tsx getMultiplierColor().replace('text-', 'bg-')
  //   components/NarrativePopup.tsx getColor().replace('border-', 'bg-').replace('/90', '/20')
  safelist: [
    // ProgressBar segments, fed by useDynamicColors primary/success/danger/warning
    'bg-slate-400',
    'bg-cyan-400',
    'bg-yellow-400',
    'bg-yellow-500',
    'bg-emerald-400',
    'bg-emerald-500',
    'bg-orange-400',
    'bg-amber-400',
    'bg-red-500',
    // NarrativePopup icon chip
    'bg-blue-500',
    'bg-blue-950/20',
    'bg-purple-500',
    'bg-purple-950/20',
    'bg-cyan-500',
    'bg-cyan-950/20',
    'bg-slate-500',
    'bg-slate-900/20'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
