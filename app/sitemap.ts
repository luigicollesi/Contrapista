import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-metadata";

const PUBLIC_ROUTES = [
  "/",
  "/jogar",
  "/instrucoes",
  "/casos",
  "/termos",
  "/privacidade",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route).toString(),
    lastModified: now,
    changeFrequency: route === "/" || route === "/casos" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/jogar" ? 0.9 : 0.6,
  }));
}
