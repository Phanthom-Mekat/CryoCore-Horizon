import { ImageResponse } from "next/og";

export const alt = "CryoCore Horizon: following Chattogram and the Bengal delta through monsoon cloud with NASA–ISRO NISAR radar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "radial-gradient(ellipse 75% 85% at 88% 58%, #0e2744 0%, #071324 48%, #050b14 84%)",
          color: "#f1ece2",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <svg width="42" height="42" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="#0b1624" stroke="#5fd4e6" strokeOpacity="0.3" strokeWidth="1" />
              <path d="M4 22h24M12.5 26h7" stroke="#f1ece2" strokeWidth="2" strokeLinecap="round" />
              <path d="M9 22a7 7 0 0 1 14 0" stroke="#5fd4e6" strokeWidth="2" />
              <path d="M5 22a11 11 0 0 1 22 0" stroke="#5fd4e6" strokeWidth="1.5" opacity={0.5} />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "22px", fontWeight: 600, color: "#f1ece2", letterSpacing: "-0.01em" }}>
                CryoCore Horizon
              </span>
              <span style={{ fontSize: "14px", color: "#96a3ad", letterSpacing: "0.01em" }}>
                NASA Space Apps Challenge 2026
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 16px",
              border: "1px solid rgba(143, 220, 184, 0.35)",
              borderRadius: "999px",
              backgroundColor: "rgba(10, 20, 36, 0.72)",
              fontSize: "15px",
              color: "#8fdcb8",
            }}
          >
            <span>Dancing with the SARs</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "48px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "720px" }}>
            <div
              style={{
                display: "flex",
                fontSize: "54px",
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: "#f1ece2",
              }}
            >
              Monsoon cloud hides Chattogram for months. Radar still sees it.
            </div>
            <div style={{ display: "flex", fontSize: "23px", lineHeight: 1.45, color: "#ccd3d8" }}>
              Following the Bengal delta through one monsoon with NASA–ISRO NISAR L-band radar.
            </div>
          </div>

          <svg width="260" height="260" viewBox="0 0 260 260" fill="none">
            <circle cx="130" cy="130" r="118" stroke="#5fd4e6" strokeOpacity="0.16" strokeWidth="1.5" />
            <circle cx="130" cy="130" r="88" stroke="#5fd4e6" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="6 6" />
            <circle cx="130" cy="130" r="56" stroke="#8fdcb8" strokeOpacity="0.45" strokeWidth="1.5" />
            <path d="M24 176 H236" stroke="#f1ece2" strokeWidth="2" strokeOpacity="0.7" />
            <path d="M74 176 A56 56 0 0 1 186 176" stroke="#5fd4e6" strokeWidth="2.5" />
            <path d="M46 176 A84 84 0 0 1 214 176" stroke="#5fd4e6" strokeOpacity="0.45" strokeWidth="2" />
            <circle cx="130" cy="176" r="5" fill="#8fdcb8" />
            <circle cx="192" cy="68" r="4" fill="#5fd4e6" />
            <path d="M192 68 L130 176" stroke="#5fd4e6" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 4" />
          </svg>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: "22px",
            borderTop: "1px solid rgba(160, 200, 230, 0.2)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", color: "#96a3ad" }}>Study area</span>
            <span style={{ fontSize: "19px", color: "#f1ece2" }}>Chattogram, 22.3° N 91.8° E</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", color: "#96a3ad" }}>Radar</span>
            <span style={{ fontSize: "19px", color: "#f1ece2" }}>L-band, 24 cm wavelength</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "14px", color: "#96a3ad" }}>Repeat pass</span>
            <span style={{ fontSize: "19px", color: "#8fdcb8" }}>Every 12 days</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
