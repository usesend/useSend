import { cn, useTheme } from "@usesend/ui";
import { Button } from "@usesend/ui/src/button";
import { Monitor, Sun, Moon, SunMoonIcon } from "lucide-react";

export const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-2 items-center justify-between">
      <p className="text-sm text-popover-foreground flex items-center gap-2">
        <SunMoonIcon className="h-4 w-4" />
        Theme
      </p>
      <div className="flex gap-2 border rounded-md p-1 ">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "p-0.5 rounded-[0.20rem]  h-5 w-5",
            theme === "system" ? " bg-muted" : "",
          )}
          onClick={() => setTheme("system")}
        >
          <Monitor className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "p-0.5 rounded-[0.20rem]  h-5 w-5",
            theme === "light" ? " bg-muted" : "",
          )}
          onClick={() => setTheme("light")}
        >
          <Sun className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "p-0.5 rounded-[0.20rem]  h-5 w-5",
            theme === "dark" ? "bg-muted" : "",
          )}
          onClick={() => setTheme("dark")}
        >
          <Moon className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export const MiniThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  const renderIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="h-4 w-4" />;
      case "dark":
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <Button variant="ghost" size="icon" onClick={cycleTheme}>
      {renderIcon()}
    </Button>
  );
};
