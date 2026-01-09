import { CSSProperties, Fragment } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  Text,
  Html,
  Head,
  Body,
  Font,
  Container,
  Link,
  Heading,
  Hr,
  Butan as Button,
  Img,
  Preview,
  Row,
  Column,
  render,
  Code,
} from "jsx-email";
import { AllowedAlignments } from "./types";

interface NodeOptions {
  parent?: JSONContent;
  prev?: JSONContent;
  next?: JSONContent;
}

export interface ThemeOptions {
  colors?: {
    heading?: string;
    paragraph?: string;
    horizontal?: string;
    footer?: string;
    blockquoteBorder?: string;
    codeBackground?: string;
    codeText?: string;
    link?: string;
  };
  fontSize?: {
    paragraph?: string;
    footer?: {
      size?: string;
      lineHeight?: string;
    };
  };
}

export interface RenderConfig {
  /**
   * The preview text is the snippet of text that is pulled into the inbox
   * preview of an email client, usually right after the subject line.
   *
   * Default: `undefined`
   */
  preview?: string;
  /**
   * The theme object allows you to customize the colors and font sizes of the
   * rendered email.
   *
   * Default:
   * ```js
   * {
   *   colors: {
   *     heading: 'rgb(17, 24, 39)',
   *     paragraph: 'rgb(55, 65, 81)',
   *     horizontal: 'rgb(234, 234, 234)',
   *     footer: 'rgb(100, 116, 139)',
   *   },
   *   fontSize: {
   *     paragraph: '15px',
   *     footer: {
   *       size: '14px',
   *       lineHeight: '24px',
   *     },
   *   },
   * }
   * ```
   *
   */
  theme?: ThemeOptions;
}

const DEFAULT_THEME: ThemeOptions = {
  colors: {
    heading: "rgb(17, 24, 39)",
    paragraph: "rgb(55, 65, 81)",
    horizontal: "rgb(234, 234, 234)",
    footer: "rgb(100, 116, 139)",
    blockquoteBorder: "rgb(209, 213, 219)",
    codeBackground: "rgb(239, 239, 239)",
    codeText: "rgb(17, 24, 39)",
    link: "rgb(59, 130, 246)",
  },
  fontSize: {
    paragraph: "15px",
    footer: {
      size: ".8rem",
    },
  },
};

const CODE_FONT_FAMILY =
  'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const allowedHeadings = ["h1", "h2", "h3"] as const;
type AllowedHeadings = (typeof allowedHeadings)[number];

const headings: Record<AllowedHeadings, CSSProperties> = {
  h1: {
    fontSize: "36px",
    lineHeight: "40px",
    fontWeight: 800,
  },
  h2: {
    fontSize: "30px",
    lineHeight: "36px",
    fontWeight: 700,
  },
  h3: {
    fontSize: "24px",
    lineHeight: "38px",
    fontWeight: 600,
  },
};

const allowedSpacers = ["sm", "md", "lg", "xl"] as const;
export type AllowedSpacers = (typeof allowedSpacers)[number];

const spacers: Record<AllowedSpacers, string> = {
  sm: "8px",
  md: "16px",
  lg: "32px",
  xl: "64px",
};

export interface MarkType {
  [key: string]: any;
  type: string;
  attrs?: Record<string, any> | undefined;
}

const antialiased: CSSProperties = {
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
};

export function generateKey() {
  return Math.random().toString(36).substring(2, 8);
}

export type VariableFormatter = (options: {
  variable: string;
  fallback?: string;
}) => string;

const allowedLogoSizes = ["sm", "md", "lg"] as const;
type AllowedLogoSizes = (typeof allowedLogoSizes)[number];

const logoSizes: Record<AllowedLogoSizes, string> = {
  sm: "40px",
  md: "48px",
  lg: "64px",
};

type EmailRendererOption = {
  shouldReplaceVariableValues?: boolean;
  variableValues?: Record<string, string | null>;
  linkValues?: Record<string, string | null>;
};

export class EmailRenderer {
  private config: RenderConfig = {
    theme: DEFAULT_THEME,
  };
  private shouldReplaceVariableValues = false;
  private variableValues: Record<string, string | null> = {};
  private linkValues: Record<string, string | null> = {};

  constructor(
    private readonly email: JSONContent = { type: "doc", content: [] },
    options: EmailRendererOption = {}
  ) {
    this.shouldReplaceVariableValues =
      options.shouldReplaceVariableValues || false;
    this.variableValues = options.variableValues || {};
    this.linkValues = options.linkValues || {};
  }

  private variableFormatter: VariableFormatter = ({ variable, fallback }) => {
    return fallback
      ? `{{${variable},fallback=${fallback}}}`
      : `{{${variable}}}`;
  };

  public render(options: EmailRendererOption = {}) {
    this.shouldReplaceVariableValues =
      options.shouldReplaceVariableValues || false;
    this.variableValues = options.variableValues || {};
    this.linkValues = options.linkValues || {};
    const markup = this.markup();
    return render(markup);
  }

  markup() {
    const nodes = this.email.content || [];

    const jsxNodes = nodes.map((node, index) => {
      const nodeOptions: NodeOptions = {
        prev: nodes[index - 1],
        next: nodes[index + 1],
        parent: node,
      };

      const component = this.renderNode(node, nodeOptions);
      if (!component) {
        return null;
      }

      return <Fragment key={generateKey()}>{component}</Fragment>;
    });

    const markup = (
      <Html>
        <Head>
          <Font
            fallbackFontFamily="sans-serif"
            fontFamily="Inter"
            fontStyle="normal"
            fontWeight={400}
            webFont={{
              url: "https://rsms.me/inter/font-files/Inter-Regular.woff2?v=3.19",
              format: "woff2",
            }}
          />
          <style
            dangerouslySetInnerHTML={{
              __html: `blockquote,h1,h2,h3,img,li,ol,p,ul{margin-top:0;margin-bottom:0} pre{padding:16px;border-radius:6px}`,
            }}
          />
          <meta content="width=device-width" name="viewport" />
          <meta content="IE=edge" httpEquiv="X-UA-Compatible" />
          <meta name="x-apple-disable-message-reformatting" />
          <meta
            // http://www.html-5.com/metatags/format-detection-meta-tag.html
            // It will prevent iOS from automatically detecting possible phone numbers in a block of text
            content="telephone=no,address=no,email=no,date=no,url=no"
            name="format-detection"
          />
          <meta content="light" name="color-scheme" />
          <meta content="light" name="supported-color-schemes" />
        </Head>
        <Body>
          <Container
            style={{
              maxWidth: "600px",
              minWidth: "300px",
              width: "100%",
              marginLeft: "auto",
              marginRight: "auto",
              padding: "0.5rem",
            }}
          >
            {jsxNodes}
          </Container>
        </Body>
      </Html>
    );

    return markup;
  }

  // `renderMark` will call the method of the corresponding mark type
  private renderMark(node: JSONContent): React.ReactNode {
    // It will wrap the text with the corresponding mark type
    const text = node.text || <>&nbsp;</>;
    const marks = node.marks || [];

    return marks.reduce<React.ReactNode>(
      (acc, mark) => {
        const type = mark.type;
        if (type in this) {
          // @ts-expect-error - `this` is not assignable to type 'never'
          return this[type]?.(mark, acc) as React.ReactNode;
        }

        throw new Error(`Mark type "${type}" is not supported.`);
      },
      <>{text}</>
    );
  }

  private getMappedContent(
    node: JSONContent,
    options?: NodeOptions
  ): React.ReactNode[] {
    return node.content
      ?.map((childNode) => {
        const component = this.renderNode(childNode, options);
        if (!component) {
          return null;
        }

        return <Fragment key={generateKey()}>{component}</Fragment>;
      })
      .filter((n) => n !== null) as React.ReactNode[];
  }

  private renderNode(
    node: JSONContent,
    options: NodeOptions = {}
  ): React.ReactNode | null {
    const type = node.type || "";

    if (type in this) {
      // @ts-expect-error - `this` is not assignable to type 'never'
      return this[type]?.(node, options) as React.ReactNode;
    }

    throw new Error(`Node type "${type}" is not supported.`);
  }

  private unsubscribeFooter(
    node: JSONContent,
    options?: NodeOptions
  ): React.ReactNode {
    return (
      <Container
        style={{
          fontSize: this.config.theme?.fontSize?.footer?.size,
          lineHeight: this.config.theme?.fontSize?.footer?.lineHeight,
          maxWidth: "100%",
          color: this.config.theme?.colors?.footer,
        }}
      >
        {this.getMappedContent(node)}
      </Container>
    );
  }

  private paragraph(node: JSONContent, options?: NodeOptions): React.ReactNode {
    const { attrs } = node;
    const alignment = attrs?.textAlign || "left";

    const { parent, next } = options || {};
    const isParentListItem = parent?.type === "listItem";
    const isNextSpacer = next?.type === "spacer";

    return (
      <Text
        style={{
          textAlign: alignment,
          marginBottom: isParentListItem || isNextSpacer ? "0px" : "20px",
          marginTop: "0px",
          fontSize: this.config.theme?.fontSize?.paragraph,
          color: this.config.theme?.colors?.paragraph,
          ...antialiased,
        }}
      >
        {node.content ? this.getMappedContent(node) : <>&nbsp;</>}
      </Text>
    );
  }

  private text(node: JSONContent, _?: NodeOptions): React.ReactNode {
    const text = node.text || "&nbsp";
    if (node.marks) {
      return this.renderMark(node);
    }

    return <>{text}</>;
  }

  private bold(_: MarkType, text: React.ReactNode): React.ReactNode {
    return <strong>{text}</strong>;
  }

  private italic(_: MarkType, text: React.ReactNode): React.ReactNode {
    return <em>{text}</em>;
  }

  private underline(_: MarkType, text: React.ReactNode): React.ReactNode {
    return <u>{text}</u>;
  }

  private strike(_: MarkType, text: React.ReactNode): React.ReactNode {
    return <s style={{ textDecoration: "line-through" }}>{text}</s>;
  }

  private textStyle(mark: MarkType, text: React.ReactNode): React.ReactNode {
    const { attrs } = mark;
    const { fontSize, fontWeight, color } = attrs || {};

    return <span style={{ fontSize, fontWeight, color }}>{text}</span>;
  }

  private link(mark: MarkType, text: React.ReactNode): React.ReactNode {
    const { attrs } = mark;
    let href = attrs?.href || "#";
    const target = attrs?.target || "_blank";
    const rel = attrs?.rel || "noopener noreferrer nofollow";

    // If the href value is provided, use it to replace the link
    // Otherwise, use the original link
    if (
      typeof this.linkValues === "object" ||
      typeof this.variableValues === "object"
    ) {
      href = this.linkValues[href] || this.variableValues[href] || href;
    }

    return (
      <Link
        href={href}
        rel={rel}
        style={{
          fontWeight: 500,
          textDecoration: "underline",
          color: this.config.theme?.colors?.link,
        }}
        target={target}
      >
        {text}
      </Link>
    );
  }

  private heading(node: JSONContent, options?: NodeOptions): React.ReactNode {
    const { attrs } = node;
    const { next, prev } = options || {};

    const level = `h${Number(attrs?.level) || 1}`;
    const alignment = attrs?.textAlign || "left";
    const isNextSpacer = next?.type === "spacer";
    const isPrevSpacer = prev?.type === "spacer";

    const { fontSize, lineHeight, fontWeight } =
      headings[level as AllowedHeadings];

    return (
      <Heading
        // @ts-expect-error - `this` is not assignable to type 'never'
        as={level}
        style={{
          textAlign: alignment,
          color: this.config.theme?.colors?.heading,
          marginBottom: isNextSpacer ? "0px" : "12px",
          marginTop: isPrevSpacer ? "0px" : "0px",
          fontSize,
          lineHeight,
          fontWeight,
        }}
      >
        {this.getMappedContent(node)}
      </Heading>
    );
  }

  private variable(node: JSONContent, _?: NodeOptions): React.ReactNode {
    const { id: variable, fallback } = node.attrs || {};

    let formattedVariable = this.variableFormatter({
      variable,
      fallback,
    });

    // If `shouldReplaceVariableValues` is true, replace the variable values
    // Otherwise, just return the formatted variable
    if (this.shouldReplaceVariableValues) {
      formattedVariable =
        this.variableValues[variable] || fallback || formattedVariable;
    }

    return <>{formattedVariable}</>;
  }

  private horizontalRule(_: JSONContent, __?: NodeOptions): React.ReactNode {
    return (
      <Hr
        style={{
          marginTop: "32px",
          marginBottom: "32px",
          borderTopWidth: "2px",
        }}
      />
    );
  }

  private orderedList(node: JSONContent, _?: NodeOptions): React.ReactNode {
    return (
      <Container style={{ maxWidth: "100%" }}>
        <ol
          style={{
            marginTop: "0px",
            marginBottom: "20px",
            paddingLeft: "26px",
            listStyleType: "decimal",
          }}
        >
          {this.getMappedContent(node)}
        </ol>
      </Container>
    );
  }

  private bulletList(node: JSONContent, _?: NodeOptions): React.ReactNode {
    return (
      <Container
        style={{
          maxWidth: "100%",
        }}
      >
        <ul
          style={{
            marginTop: "0px",
            marginBottom: "20px",
            paddingLeft: "26px",
            listStyleType: "disc",
          }}
        >
          {this.getMappedContent(node)}
        </ul>
      </Container>
    );
  }

  private listItem(node: JSONContent, options?: NodeOptions): React.ReactNode {
    return (
      <Container
        style={{
          maxWidth: "100%",
        }}
      >
        <li
          style={{
            marginBottom: "8px",
            paddingLeft: "6px",
            ...antialiased,
          }}
        >
          {this.getMappedContent(node, { ...options, parent: node })}
        </li>
      </Container>
    );
  }

  private button(node: JSONContent, options?: NodeOptions): React.ReactNode {
    const { attrs } = node;
    const {
      text,
      url,
      buttonColor,
      textColor,
      borderRadius,
      borderColor,
      borderWidth,
      textAlign,
      alignment,
    } = attrs || {};
    // Support both textAlign (preferred) and alignment (legacy) attributes
    const buttonAlignment = textAlign ?? alignment ?? "left";

    const { next } = options || {};
    const isNextSpacer = next?.type === "spacer";

    const href = this.linkValues[url] || this.variableValues[url] || url;

    return (
      <Container
        style={{
          textAlign: buttonAlignment,
          maxWidth: "100%",
          marginBottom: isNextSpacer ? "0px" : "20px",
        }}
      >
        <Button
          href={href}
          style={{
            color: String(textColor),
            backgroundColor: buttonColor,
            borderColor: borderColor,
            padding: "12px 34px",
            borderWidth,
            borderStyle: "solid",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 500,
            borderRadius: `${borderRadius}px`,
          }}
        >
          {text}
        </Button>
      </Container>
    );
  }

  private spacer(node: JSONContent, _?: NodeOptions): React.ReactNode {
    const { attrs } = node;
    const { height = "auto" } = attrs || {};

    return (
      <Container
        style={{
          height: spacers[height as AllowedSpacers] || height,
        }}
      />
    );
  }

  private hardBreak(_: JSONContent, __?: NodeOptions): React.ReactNode {
    return <br />;
  }

  private logo(node: JSONContent, options?: NodeOptions): React.ReactNode {
    const { attrs } = node;
    const {
      src,
      alt,
      title,
      size,
      textAlign,
      alignment,
    } = attrs || {};
    // Support both textAlign (preferred) and alignment (legacy) attributes
    const logoAlignment = textAlign ?? alignment ?? "left";

    const { next } = options || {};
    const isNextSpacer = next?.type === "spacer";

    return (
      <Row
        style={{
          marginTop: "0px",
          marginBottom: isNextSpacer ? "0px" : "32px",
        }}
      >
        <Column align={logoAlignment}>
          <Img
            alt={alt || title || "Logo"}
            src={src}
            style={{
              width: logoSizes[size as AllowedLogoSizes] || size,
              height: logoSizes[size as AllowedLogoSizes] || size,
            }}
            title={title || alt || "Logo"}
          />
        </Column>
      </Row>
    );
  }

  private image(node: JSONContent, options?: NodeOptions): React.ReactNode {
    const { attrs } = node;
    const {
      src,
      alt,
      title,
      width = "auto",
      height = "auto",
      alignment = "center",
      externalLink = "",
      borderRadius,
      borderColor,
      borderWidth,
    } = attrs || {};

    const { next } = options || {};
    const isNextSpacer = next?.type === "spacer";

    const mainImage = (
      <Img
        alt={alt || title || "Image"}
        src={src}
        style={{
          height,
          width,
          maxWidth: "100%",
          outline: "none",
          textDecoration: "none",
          borderStyle: "solid",
          borderRadius: `${borderRadius}px`,
          borderColor,
          borderWidth: `${borderWidth}px`,
        }}
        title={title || alt || "Image"}
      />
    );

    return (
      <Row
        style={{
          marginTop: "0px",
          marginBottom: isNextSpacer ? "0px" : "32px",
        }}
      >
        <Column align={alignment}>
          {externalLink ? (
            <a
              href={externalLink}
              rel="noopener noreferrer"
              style={{
                display: "block",
                maxWidth: "100%",
                textDecoration: "none",
              }}
              target="_blank"
            >
              {mainImage}
            </a>
          ) : (
            mainImage
          )}
        </Column>
      </Row>
    );
  }

  private blockquote(
    node: JSONContent,
    options?: NodeOptions
  ): React.ReactNode {
    const { next, prev } = options || {};
    const isNextSpacer = next?.type === "spacer";
    const isPrevSpacer = prev?.type === "spacer";

    return (
      <blockquote
        style={{
          borderLeftWidth: "4px",
          borderLeftStyle: "solid",
          borderLeftColor: this.config.theme?.colors?.blockquoteBorder,
          paddingLeft: "16px",
          marginLeft: "0px",
          marginRight: "0px",
          marginTop: isPrevSpacer ? "0px" : "20px",
          marginBottom: isNextSpacer ? "0px" : "20px",
        }}
      >
        {this.getMappedContent(node)}
      </blockquote>
    );
  }

  private code(_: MarkType, text: React.ReactNode): React.ReactNode {
    return (
      <code
        style={{
          backgroundColor: this.config.theme?.colors?.codeBackground,
          color: this.config.theme?.colors?.codeText,
          padding: "2px 4px",
          borderRadius: "6px",
          fontFamily: CODE_FONT_FAMILY,
          fontWeight: 400,
          letterSpacing: 0,
        }}
      >
        {text}
      </code>
    );
  }

  private codeBlock(node: JSONContent, options?: NodeOptions): React.ReactNode {
    const { attrs } = node;
    const language = attrs?.language;

    const content = node.content || [];

    return (
      <Code language={language}>
        {content
          .map((n) => {
            return n.text;
          })
          .join("")}
      </Code>
    );
  }
}
