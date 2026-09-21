import {
  CircleMarker,
  Polyline,
  Tooltip,
} from "react-leaflet";

import {
  useMapStore,
} from "../../store/useMapStore";

import {
  rankSources,
} from "../../utils/attribution";

const getSourceId = (
  source,
) =>
  String(
    source?.id ??
      source?.source_id ??
      source?.vessel_id ??
      source?.infra_id ??
      "",
  );

const getTrackSourceId = (
  track,
) =>
  String(
    track?.related_source_id ??
      track?.source_id ??
      track?.vessel_id ??
      "",
  );

const getLatestPosition = (
  track,
) => {
  const positions =
    Array.isArray(
      track?.positions,
    )
      ? track.positions
      : [];

  const last =
    positions[
      positions.length - 1
    ];

  if (
    !Array.isArray(last) ||
    last.length < 2
  ) {
    return null;
  }

  const longitude =
    Number(last[0]);

  const latitude =
    Number(last[1]);

  if (
    !Number.isFinite(
      latitude,
    ) ||
    !Number.isFinite(
      longitude,
    )
  ) {
    return null;
  }

  return [
    latitude,
    longitude,
  ];
};

export function AISLayer() {
  const tracks =
    useMapStore(
      (state) =>
        state.aisTracks,
    );

  const selectedSlick =
    useMapStore((state) =>
      state.slicks.find(
        (slick) =>
          slick.id ===
          state.selectedSlickId,
      ),
    );

  const selectedSourceId =
    useMapStore(
      (state) =>
        state.selectedSourceId,
    );

  const rankedSources =
    rankSources(
      selectedSlick?.sources ??
        [],
      3,
    );

  const topCandidate =
    rankedSources[0] ??
    null;

  const effectiveSourceId =
    selectedSourceId ??
    getSourceId(
      topCandidate,
    );

  if (!Array.isArray(tracks)) {
    return null;
  }

  return tracks.map(
    (track) => {
      const sourceId =
        getTrackSourceId(
          track,
        );

      const highlighted =
        Boolean(
          effectiveSourceId &&
            sourceId ===
              String(
                effectiveSourceId,
              ),
        );

      const positions =
        Array.isArray(
          track?.positions,
        )
          ? track.positions
              .filter(
                (position) =>
                  Array.isArray(
                    position,
                  ) &&
                  position.length >=
                    2,
              )
              .map(
                ([
                  longitude,
                  latitude,
                ]) => [
                  Number(
                    latitude,
                  ),
                  Number(
                    longitude,
                  ),
                ],
              )
              .filter(
                ([
                  latitude,
                  longitude,
                ]) =>
                  Number.isFinite(
                    latitude,
                  ) &&
                  Number.isFinite(
                    longitude,
                  ),
              )
          : [];

      if (positions.length < 2) {
        return null;
      }

      const latest =
        getLatestPosition(
          track,
        );

      return (
        <span
          key={
            track.vessel_id ??
            sourceId
          }
        >
          <Polyline
            positions={
              positions
            }
            pathOptions={{
              color:
                highlighted
                  ? "#2563eb"
                  : "#60a5fa",
              weight:
                highlighted
                  ? 4
                  : 1,
              opacity:
                highlighted
                  ? 0.98
                  : 0.18,
              dashArray:
                highlighted
                  ? undefined
                  : "3 7",
            }}
          >
            <Tooltip sticky>
              <strong>
                {track.vessel_id ??
                  "Unknown vessel"}
              </strong>

              <br />

              {highlighted
                ? "Selected candidate"
                : "AIS track"}

              {Number.isFinite(
                Number(
                  track.speed,
                ),
              ) &&
                ` · ${track.speed} kn`}

              {Number.isFinite(
                Number(
                  track.heading,
                ),
              ) &&
                ` · ${track.heading}°`}
            </Tooltip>
          </Polyline>

          {highlighted &&
            latest && (
              <CircleMarker
                center={latest}
                radius={6}
                pathOptions={{
                  color: "#ffffff",
                  fillColor:
                    "#2563eb",
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[
                    0,
                    -5,
                  ]}
                >
                  Selected AIS
                  candidate:{" "}
                  {track.vessel_id ??
                    sourceId}
                </Tooltip>
              </CircleMarker>
            )}
        </span>
      );
    },
  );
}