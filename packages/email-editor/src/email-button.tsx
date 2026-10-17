import type { ComponentProps, CSSProperties } from "react";

// Copy of jsx-email's deprecated `Butan` component (v2.8.4) without the
// deprecation warning it logs on every render. jsx-email's newer `Button`
// renders different markup, so this keeps sent emails byte-for-byte identical.

type PaddingValue = string | number | undefined;

function convertToPx(value: PaddingValue): number {
  if (!value) return 0;
  if (typeof value === "number") return value;

  const matches = value.match(/^([\d.]+)(px|em|rem|%)$/);
  if (!matches) return 0;

  const numValue = parseFloat(matches[1]!);
  switch (matches[2]) {
    case "em":
    case "rem":
      return numValue * 16;
    case "%":
      return (numValue / 100) * 600;
    default:
      return numValue;
  }
}

function parsePadding({
  padding,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
}: CSSProperties) {
  if (
    ![padding, paddingTop, paddingRight, paddingBottom, paddingLeft].some(
      (value) => typeof value !== "undefined"
    )
  ) {
    return undefined;
  }

  let pt = 0;
  let pr = 0;
  let pb = 0;
  let pl = 0;

  if (typeof padding === "number") {
    pt = pr = pb = pl = padding;
  } else if (typeof padding !== "undefined") {
    const values = padding.split(/\s+/);
    switch (values.length) {
      case 1:
        pt = pr = pb = pl = convertToPx(values[0]);
        break;
      case 2:
        pt = pb = convertToPx(values[0]);
        pr = pl = convertToPx(values[1]);
        break;
      case 3:
        pt = convertToPx(values[0]);
        pr = pl = convertToPx(values[1]);
        pb = convertToPx(values[2]);
        break;
      case 4:
        pt = convertToPx(values[0]);
        pr = convertToPx(values[1]);
        pb = convertToPx(values[2]);
        pl = convertToPx(values[3]);
        break;
    }
  }

  return {
    pb: paddingBottom ? convertToPx(paddingBottom) : pb,
    pl: paddingLeft ? convertToPx(paddingLeft) : pl,
    pr: paddingRight ? convertToPx(paddingRight) : pr,
    pt: paddingTop ? convertToPx(paddingTop) : pt,
  };
}

const pxToPt = (px: number) => (isNaN(px) ? null : (px * 3) / 4);

export function EmailButton({
  children,
  style,
  ...props
}: ComponentProps<"a">) {
  const restStyle: CSSProperties = { ...style };
  delete restStyle.padding;
  const parsedPadding = parsePadding(style || {});

  let textRaiseTop = "";
  let textRaiseBottom = 0;
  let letterSpacingLeft = "";
  let letterSpacingRight = "";

  if (parsedPadding) {
    const { pt, pb, pl, pr } = parsedPadding;
    letterSpacingLeft = `letter-spacing: ${pl}px;`;
    letterSpacingRight = `letter-spacing: ${pr}px;`;
    textRaiseTop = `mso-text-raise: ${pxToPt(pt + pb) ?? undefined};`;
    textRaiseBottom = pb;
  }

  return (
    <a
      {...props}
      style={{
        ...restStyle,
        display: "inline-block",
        lineHeight: "100%",
        maxWidth: "100%",
        padding: parsedPadding
          ? `${parsedPadding.pt}px ${parsedPadding.pr}px ${parsedPadding.pb}px ${parsedPadding.pl}px`
          : undefined,
        textDecoration: "none",
      }}
    >
      <span
        dangerouslySetInnerHTML={{
          __html: `<!--[if mso]><i style="${letterSpacingLeft}mso-font-width:-100%;${textRaiseTop}" hidden>&nbsp;</i><![endif]-->`,
        }}
      />
      <span
        style={
          {
            display: "inline-block",
            lineHeight: "120%",
            maxWidth: "100%",
            msoPaddingAlt: "0px",
            msoTextRaise: pxToPt(textRaiseBottom),
          } as CSSProperties
        }
      >
        {children}
      </span>
      <span
        dangerouslySetInnerHTML={{
          __html: `<!--[if mso]><i style="${letterSpacingRight}mso-font-width:-100%" hidden>&nbsp;</i><![endif]-->`,
        }}
      />
    </a>
  );
}
