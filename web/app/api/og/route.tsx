import { ImageResponse } from "next/og";

export const runtime = "edge";

// Share card. Optional ?title= and ?sub= for repo permalinks.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? "Hublands";
  const sub = searchParams.get("sub") ?? "A survey chart of the open model ecosystem";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#F3ECDA",
          padding: 64,
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 64,
            right: 64,
            height: 10,
            display: "flex",
            background:
              "linear-gradient(to right, #F3ECDA, #C9E4D6, #EDD9A3, #A9C77F, #74A85E, #3C7440)",
          }}
        />
        <div
          style={{
            display: "flex",
            color: "#3D3423",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", color: "#4F8A4C", fontSize: 30, marginTop: 16 }}>{sub}</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "#3D3423",
            opacity: 0.6,
            fontSize: 22,
            marginTop: 42,
          }}
        >
          <span>● model · ○ dataset · dense water is heavy traffic</span>
          <span>hublands</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
