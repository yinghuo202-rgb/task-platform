import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "la vie",
    short_name: "la vie",
    description: "两个人的日历、手帐和清单",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#f1d47d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
