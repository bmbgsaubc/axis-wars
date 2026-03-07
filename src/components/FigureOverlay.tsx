export default function FigureOverlay({
  imageUrl,
  xText,
  yText,
}: {
  imageUrl: string;
  xText: string;
  yText: string;
}) {
  return (
    <div style={{ position: "relative", width: 500 }}>
      <img src={imageUrl} alt="figure" style={{ width: "100%", display: "block" }} />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.9)",
          padding: "4px 8px",
          borderRadius: 6,
          fontWeight: 600,
        }}
      >
        {xText}
      </div>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: -40,
          transform: "translateY(-50%) rotate(-90deg)",
          transformOrigin: "left top",
          background: "rgba(255,255,255,0.9)",
          padding: "4px 8px",
          borderRadius: 6,
          fontWeight: 600,
        }}
      >
        {yText}
      </div>
    </div>
  );
}