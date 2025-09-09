/** @type {import("next").NextConfig} */
const config = {
  // Use static export in production by default; keep dev server dynamic
  output: "export",
  images: {
    // Required for static export if using images
    unoptimized: true,
  },
};

export default config;
