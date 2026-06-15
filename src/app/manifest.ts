import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tanca+",
    short_name: "Tanca+",
    description: "Satis ekibini motive eden mobil uyumlu web oyunu",
    start_url: "/",
    display: "standalone",
    background_color: "#0b2143",
    theme_color: "#0b2143",
    id: "/",
    icons: [
      {
        src: "/icon-192.png?v=3",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icon-512.png?v=3",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/apple-touch-icon.png?v=3",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
