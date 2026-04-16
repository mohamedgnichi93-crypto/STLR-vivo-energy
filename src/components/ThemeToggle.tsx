import { useTheme } from '@/hooks/useTheme';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ThemeToggle = () => {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className="border-border text-muted-foreground hover:text-foreground transition-all duration-300"
      aria-label="Basculer le thème"
    >
      <span className="flex items-center gap-2">
        {isDark ? (
          <>
            <Moon className="h-3.5 w-3.5" />
            <span className="text-xs">Mode sombre</span>
          </>
        ) : (
          <>
            <Sun className="h-3.5 w-3.5" />
            <span className="text-xs">Mode clair</span>
          </>
        )}
      </span>
    </Button>
  );
};

export default ThemeToggle;
