import { useTheme as useThemeContext } from '@/lib/themeContext';

export function useTheme() {
  const { isDark, toggleTheme } = useThemeContext();
  const theme = isDark ? 'dark' : 'light';

  return { 
    theme, 
    toggleTheme, 
    isDark 
  };
}
