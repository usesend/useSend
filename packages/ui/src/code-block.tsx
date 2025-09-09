import { BundledLanguage, codeToHast } from "shiki";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { cn } from "../lib/utils";

interface Props {
  children: string;
  lang: BundledLanguage;
  className?: string;
}

export async function CodeBlock(props: Props) {
  const out = await codeToHast(props.children, {
    lang: props.lang,
    themes: {
      dark: "catppuccin-mocha",
      light: "catppuccin-latte",
    },
  });

  return toJsxRuntime(out, {
    Fragment,
    jsx,
    jsxs,
    components: {
      // your custom `pre` element
      pre: (nodeProps) => (
        <pre
          {...nodeProps}
          className={cn(nodeProps.className, props.className)}
        />
      ),
    },
  }) as React.JSX.Element;
}
