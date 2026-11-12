import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 62%, #0d213a 0%, #050b14 75%)",
        }}
      >
        <svg width="136" height="136" viewBox="0 0 32 32" fill="none">
          <path d="M4 22h24M12.5 26h7" stroke="#f1ece2" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 22a7 7 0 0 1 14 0" stroke="#5fd4e6" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M5 22a11 11 0 0 1 22 0"
            stroke="#5fd4e6"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity={0.5}
          />
          <circle cx="16" cy="22" r="1.5" fill="#8fdcb8" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
