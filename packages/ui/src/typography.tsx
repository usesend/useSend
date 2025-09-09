import * as React from "react";
import { cn } from "../lib/utils";

// Simple typography primitives: H1, H2, BodyText
// H1/H2 use mono font, slightly bolder and larger per request

export interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
}

export const H1 = React.forwardRef<HTMLHeadingElement, TypographyProps>(
  ({ className, ...props }, ref) => (
    <h1
      ref={ref}
      className={cn(
        // font-mono, larger and a bit bolder
        " font-mono text-xl font-medium text-primary",
        className
      )}
      {...props}
    />
  )
);
H1.displayName = "H1";

export const H2 = React.forwardRef<HTMLHeadingElement, TypographyProps>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn(
        // font-mono, slightly smaller than H1, bold
        "font-mono text-lg",
        className
      )}
      {...props}
    />
  )
);
H2.displayName = "H2";

export const BodyText = React.forwardRef<HTMLParagraphElement, TypographyProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        // default body text styling
        "leading-7 text-foreground/90",
        className
      )}
      {...props}
    />
  )
);
BodyText.displayName = "BodyText";
