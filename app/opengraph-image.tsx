import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site-metadata";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at 80% 20%, rgba(191, 38, 53, 0.45), transparent 34%), linear-gradient(135deg, #10130f 0%, #171a1a 55%, #2a1114 100%)",
          color: "#f2e6c8",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: 72,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "2px solid rgba(208, 168, 92, 0.52)",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            justifyContent: "space-between",
            padding: 48,
            width: "100%",
          }}
        >
          <div
            style={{
              color: "#d0a85c",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: 8,
              textTransform: "uppercase",
            }}
          >
            {SITE_TAGLINE}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div
              style={{
                color: "#fff3cf",
                fontSize: 112,
                fontWeight: 900,
                lineHeight: 0.9,
              }}
            >
              {SITE_NAME}
            </div>
            <div
              style={{
                color: "#d8d0bd",
                fontSize: 34,
                lineHeight: 1.25,
                maxWidth: 820,
              }}
            >
              {SITE_DESCRIPTION}
            </div>
          </div>
          <div
            style={{
              alignItems: "center",
              color: "#f2e6c8",
              display: "flex",
              fontSize: 28,
              fontWeight: 800,
              gap: 18,
            }}
          >
            <span
              style={{
                background: "#d0a85c",
                borderRadius: 999,
                display: "block",
                height: 12,
                width: 12,
              }}
            />
            Investigue, confronte, vença primeiro.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
