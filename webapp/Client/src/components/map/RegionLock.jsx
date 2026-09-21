import { Rectangle } from "react-leaflet";

export function RegionLock({ bounds }) {
  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{
        color: "#8dd5c4",
        weight: 1,
        opacity: 0.65,
        fill: false,
        dashArray: "5 7",
      }}
    />
  );
}
