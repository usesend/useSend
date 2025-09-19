import type { MDXComponents } from "mdx/types";

const components = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-semibold tracking-wide font-sans text-primary">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold tracking-wide font-sans text-primary">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-medium tracking-wide font-sans">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-base font-normal tracking-wide leading-relaxed font-sans">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside font-sans pl-4 space-y-1">
      {children}
    </ul>
  ),
  a: ({ children, href }) => (
    <a href={href} className=" text-primary-light">
      {children}
    </a>
  ),
} satisfies MDXComponents;

export function useMDXComponents(): MDXComponents {
  return components;
}
