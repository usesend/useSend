import createMDX from "@next/mdx";

/** @type {import("next").NextConfig} */
const config = {
  // Use static export in production by default; keep dev server dynamic
  output: "export",
  images: {
    // Required for static export if using images
    unoptimized: true,
  },
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
});

export default withMDX(config);
