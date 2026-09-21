export function DarkVesselBadge({ slick }) {
  const isDarkVessel = slick.sources.some(
    (source) => source.type === "dark_vessel",
  );

  if (!isDarkVessel) {
    return null;
  }

  return (
    <span className="rounded-full border border-[#e0ad62] bg-[#fff1d7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b5c1d]">
      Dark vessel
    </span>
  );
}
