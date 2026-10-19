import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zucchero — Gestão para confeitarias",
    short_name: "Zucchero",
    description: "A rotina da confeitaria, no ritmo de quem faz.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f3ea",
    theme_color: "#f8f3ea",
    lang: "pt-BR",
    icons: [
      {
        src: "/zucchero-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/zucchero-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
