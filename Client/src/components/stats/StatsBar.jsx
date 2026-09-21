import { useMemo } from "react";
import {
  matchesFilters,
  useMapStore,
} from "../../store/useMapStore";

const safeNumber = (
  value,
  fallback = 0,
) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const formatArea = (value) => {
  const number = safeNumber(value);

  return `${number.toFixed(1)} km²`;
};

export function StatsBar() {
  const slicks = useMapStore(
    (state) => state.slicks,
  );

  const filters = useMapStore(
    (state) => state.filters,
  );

  const stats = useMemo(() => {
    const filteredSlicks = slicks.filter(
      (slick) =>
        matchesFilters(
          slick,
          filters,
        ),
    );

    const highConfidence =
      filteredSlicks.filter(
        (slick) =>
          safeNumber(
            slick?.detection_confidence,
          ) >= 0.9,
      ).length;

    const darkVesselCases =
      filteredSlicks.filter(
        (slick) =>
          Array.isArray(slick?.sources) &&
          slick.sources.some(
            (source) =>
              source?.type ===
              "dark_vessel",
          ),
      ).length;

    const verified =
      filteredSlicks.filter(
        (slick) =>
          slick?.hitl_reviewed === true,
      ).length;

    const detectedArea =
      filteredSlicks.reduce(
        (sum, slick) =>
          sum +
          safeNumber(
            slick?.area,
          ),
        0,
      );

    return [
      {
        label: "Detections",
        value: filteredSlicks.length,
        detail: `${slicks.length} loaded`,
        tone: "orange",
      },
      {
        label: "High confidence",
        value: highConfidence,
        detail: "≥ 0.90 detection",
        tone: "blue",
      },
      {
        label: "Dark vessel",
        value: darkVesselCases,
        detail: "source-linked cases",
        tone: "amber",
      },
      {
        label: "Verified",
        value: verified,
        detail: "HITL reviewed",
        tone: "teal",
      },
      {
        label: "Detected area",
        value: formatArea(
          detectedArea,
        ),
        detail: filteredSlicks.length
          ? "filtered total"
          : "no matching area",
        tone: "slate",
      },
    ];
  }, [filters, slicks]);

  const toneClasses = {
    orange: "bg-[#ef7d2f]",
    blue: "bg-[#5d8ca8]",
    amber: "bg-[#d8a64d]",
    teal: "bg-[#45a99a]",
    slate: "bg-[#879394]",
  };

  return (
    <div className="pointer-events-none absolute left-[75px] right-4 top-4 z-[550] flex max-w-[calc(100%-108px)] gap-2 overflow-x-auto pb-1 scrollbar-none">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="min-w-[138px] shrink-0 rounded-xl border border-[#d1d8d3] bg-[#f8f6ef]/95 px-3.5 py-3 shadow-[0_8px_24px_rgba(45,60,59,0.09)] backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${toneClasses[stat.tone]}`}
            />

            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#788586]">
              {stat.label}
            </p>
          </div>

          <p className="mt-1.5 text-[18px] font-semibold leading-none text-[#33474b]">
            {stat.value}
          </p>

          <p className="mt-1 text-[9px] text-[#8a9595]">
            {stat.detail}
          </p>
        </div>
      ))}
    </div>
  );
}