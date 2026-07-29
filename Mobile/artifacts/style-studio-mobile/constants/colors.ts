/**
 * Style Studio design tokens — synced with artifacts/style-studio/src/index.css
 * Cream background + electric indigo primary + hot pink accent.
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#131118',
    tint: '#4321E5',

    // Core surfaces
    background: '#FAF9F6',
    foreground: '#131118',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#131118',

    // Primary action color (electric indigo-blue)
    primary: '#4321E5',
    primaryForeground: '#FFFFFF',

    // Secondary surfaces (warm sand)
    secondary: '#EBE7DE',
    secondaryForeground: '#131118',

    // Muted / subdued elements
    muted: '#EFECE5',
    mutedForeground: '#6E6A75',

    // Accent highlights (hot pink)
    accent: '#E93CB0',
    accentForeground: '#FFFFFF',

    // Destructive actions
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',

    // Borders and input outlines
    border: '#E5E1D8',
    input: '#E5E1D8',
  },

  // Matches the web artifact's --radius: 1rem
  radius: 16,
};

export const fonts = {
  heading: 'Syne_700Bold' as const,
  headingSemi: 'Syne_600SemiBold' as const,
  body: 'PlusJakartaSans_400Regular' as const,
  bodyMedium: 'PlusJakartaSans_500Medium' as const,
  bodySemi: 'PlusJakartaSans_600SemiBold' as const,
  bodyBold: 'PlusJakartaSans_700Bold' as const,
};

export default colors;
