import type { ReactNode } from "react";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata(
  "Sala privada",
  "Mesa temporária do Contrapista.",
);

export default function RoomLayout({ children }: { children: ReactNode }) {
  return children;
}
