import { useTheme } from "@usesend/ui";

export function useColors() {
  const { resolvedTheme } = useTheme();

  const lightColors = {
    delivered: "#40a02b",
    bounced: "#d20f39",
    complained: "#df8e1d",
    opened: "#8839ef",
    clicked: "#04a5e5",
    xaxis: "#6D6F84",
  };

  const darkColors = {
    delivered: "#a6e3a1",
    bounced: "#f38ba8",
    complained: "#F9E2AF",
    opened: "#cba6f7",
    clicked: "#93c5fd",
    xaxis: "#AAB1CD",
  };

  const currentColors = resolvedTheme === "dark" ? darkColors : lightColors;

  return currentColors;
}
