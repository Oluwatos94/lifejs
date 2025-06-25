import pluginCapsize from "tailwindcss-capsize";

export default {
  theme: {
    fontFamily: {
      body: ["PP Neue Montreal Medium", "sans-serif"],
      heading: ["SF Pro Display Medium", "sans-serif"],
      code: ["Geist Mono", "sans-serif"],
      handwriting: ["Gloria Hallelujah", "sans-serif"],
    },
    fontMetrics: {
      body: {
        capHeight: 715,
        ascent: 958,
        descent: -242,
        lineGap: 0,
        unitsPerEm: 1000,
      },
      heading: {
        capHeight: 1443,
        ascent: 1950,
        descent: -494,
        lineGap: 0,
        unitsPerEm: 2048,
      },
      code: {
        capHeight: 710,
        ascent: 1005,
        descent: -295,
        lineGap: 0,
        unitsPerEm: 1000,
      },
      handwriting: {
        capHeight: 904,
        ascent: 1439,
        descent: -591,
        lineGap: 0,
        unitsPerEm: 1024,
      },
    },
  },
  plugins: [pluginCapsize({ className: "leading-trim" })],
};
