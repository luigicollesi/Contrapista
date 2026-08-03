import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/jogar", "/instrucoes", "/casos", "/termos", "/privacidade"],
        disallow: [
          "/api/",
          "/auth/",
          "/jogar/busca",
          "/jogar/diario",
          "/perfil",
          "/sala/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
