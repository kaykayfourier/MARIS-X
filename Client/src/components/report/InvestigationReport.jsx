import {
  createPortal,
} from "react-dom";

import {
  formatFactor,
  formatScore,
  getAttributionSignals,
  getSourceScore,
  rankSources,
} from "../../utils/attribution";

const safeNumber = (
  value,
  fallback = 0,
) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const sourceLabel = (
  source,
) =>
  source?.name ??
  source?.id ??
  source?.source_id ??
  source?.vessel_id ??
  source?.infra_id ??
  "Unknown source";

const sourceTypeLabel = (
  type,
) =>
  type === "dark_vessel"
    ? "Dark vessel"
    : type ===
        "infrastructure"
      ? "Infrastructure"
      : "AIS vessel";

const formatDate = (
  value,
) => {
  if (!value) {
    return "Not available";
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? String(value)
    : date.toLocaleString();
};

export function InvestigationReport({
  slick,
  onClose,
}) {
  if (!slick) {
    return null;
  }

  const sources = rankSources(
    slick.sources,
    3,
  );

  const drift =
    slick.drift ?? {};

  const hindcast =
    Array.isArray(
      drift.hindcast,
    )
      ? drift.hindcast
      : [];

  const forecast =
    Array.isArray(
      drift.forecast,
    )
      ? drift.forecast
      : [];

  const allSignals =
    sources.flatMap(
      (source) =>
        getAttributionSignals(
          source,
        ),
    );

  const strongestSignal =
    allSignals.length
      ? [...allSignals].sort(
          (a, b) =>
            b.score -
            a.score,
        )[0]
      : null;

  const reportRows =
    sources.map(
      (source, index) => ({
        rank: index + 1,

        source:
          sourceLabel(
            source,
          ),

        type:
          sourceTypeLabel(
            source?.type,
          ),

        score:
          formatScore(
            getSourceScore(
              source,
            ),
          ),

        evidence:
          formatFactor(
            source?.dominant_factor,
          ),
      }),
    );

  const printReport = () =>
    window.print();

  const exportEvidence = () => {
    const payload = {
      generated_at:
        new Date().toISOString(),

      slick: {
        id: slick.id,

        class:
          slick.class,

        area_km2:
          safeNumber(
            slick.area,
          ),

        age_hours:
          safeNumber(
            slick.age_estimate,
          ),

        detection_confidence:
          safeNumber(
            slick.detection_confidence,
          ),

        slick_confidence:
          safeNumber(
            slick.slick_confidence,
          ),

        timestamp:
          slick.timestamp ??
          null,

        hitl_reviewed:
          slick.hitl_reviewed ===
          true,
      },

      candidate_sources:
        sources.map(
          (
            source,
            index,
          ) => ({
            rank:
              index + 1,

            id:
              sourceLabel(
                source,
              ),

            type:
              source?.type ??
              "vessel",

            fused_score:
              getSourceScore(
                source,
              ),

            dominant_factor:
              formatFactor(
                source?.dominant_factor,
              ),

            evidence_signals:
              getAttributionSignals(
                source,
              ),
          }),
        ),

      drift: {
        hindcast_steps:
          hindcast.length,

        forecast_steps:
          forecast.length,

        note:
          "Prototype deterministic visualization; not a scientific ocean-current forecast.",
      },

      note:
        "MarineEye prototype evidence export. Attribution values are ranking signals, not probabilities or definitive proof of responsibility.",
    };

    const blob =
      new Blob(
        [
          JSON.stringify(
            payload,
            null,
            2,
          ),
        ],
        {
          type:
            "application/json",
        },
      );

    const url =
      URL.createObjectURL(
        blob,
      );

    const anchor =
      document.createElement(
        "a",
      );

    anchor.href = url;

    anchor.download = `marineeye-${
      slick.id ??
      "investigation"
    }.json`;

    document.body.appendChild(
      anchor,
    );

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(
      url,
    );
  };

  return createPortal(
    <div
      id="marineeye-print-root"
      className="fixed inset-0 z-[3000] overflow-y-auto bg-black/45 p-4 sm:p-8"
    >
      <div className="mx-auto min-h-full max-w-5xl">
        <div className="rounded-2xl border border-[#cdd4ce] bg-[#f8f6ef] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#d4dad5] px-6 py-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#718083]">
                MarineEye
                investigation
                report
              </p>

              <h1 className="mt-1 text-xl font-semibold text-[#253642]">
                {slick.id ??
                  "Unknown slick"}
              </h1>

              <p className="mt-1 text-[10px] text-[#7b8b8c]">
                Generated{" "}
                {new Date().toLocaleString()}
              </p>
            </div>

            <div className="marineeye-print-actions flex items-center gap-2">
              <button
                type="button"
                onClick={
                  exportEvidence
                }
                className="rounded-lg border border-[#cbd5d0] bg-white px-3 py-2 text-xs font-semibold text-[#3d5558] hover:bg-[#f2f4f1]"
              >
                Export JSON
              </button>

              <button
                type="button"
                onClick={
                  printReport
                }
                className="rounded-lg border border-[#cbd5d0] bg-white px-3 py-2 text-xs font-semibold text-[#3d5558] hover:bg-[#f2f4f1]"
              >
                Print / Save PDF
              </button>

              <button
                type="button"
                onClick={
                  onClose
                }
                className="rounded-lg border border-[#cbd5d0] bg-white px-3 py-2 text-xs font-semibold text-[#3d5558] hover:bg-[#f2f4f1]"
              >
                Close
              </button>
            </div>
          </div>

          <div className="space-y-6 px-6 py-6">
            <section className="grid gap-3 sm:grid-cols-4">
              {[
                [
                  "Area",
                  `${safeNumber(
                    slick.area,
                  ).toFixed(
                    1,
                  )} km²`,
                ],

                [
                  "Age",
                  `${safeNumber(
                    slick.age_estimate,
                  ).toFixed(
                    1,
                  )} h`,
                ],

                [
                  "Detection",
                  formatScore(
                    slick.detection_confidence,
                  ),
                ],

                [
                  "Slick score",
                  formatScore(
                    slick.slick_confidence,
                  ),
                ],
              ].map(
                ([
                  label,
                  value,
                ]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-[#d5dcd7] bg-white px-4 py-3"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a8788]">
                      {label}
                    </p>

                    <p className="mt-1 text-lg font-semibold text-[#253642]">
                      {value}
                    </p>
                  </div>
                ),
              )}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#d5dcd7] bg-white p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                  Classification
                </p>

                <p className="mt-2 text-sm font-semibold text-[#253642]">
                  {slick.class ??
                    "Unclassified"}
                </p>

                <p className="mt-2 text-xs leading-5 text-[#667779]">
                  Observation:{" "}
                  {formatDate(
                    slick.timestamp,
                  )}
                </p>

                <p className="mt-1 text-xs text-[#667779]">
                  Review status:{" "}
                  {slick.hitl_reviewed ===
                  true
                    ? "Verified"
                    : "Unverified"}
                </p>
              </div>

              <div className="rounded-xl border border-[#d5dcd7] bg-white p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                  Drift analysis
                </p>

                <p className="mt-2 text-sm font-semibold text-[#253642]">
                  {
                    hindcast.length
                  }{" "}
                  hindcast ·{" "}
                  {
                    forecast.length
                  }{" "}
                  forecast steps
                </p>

                <p className="mt-2 text-xs leading-5 text-[#667779]">
                  Prototype
                  hindcast/forecast
                  visualization. It
                  is not a scientific
                  ocean-current
                  forecast.
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-[#d5dcd7] bg-[#eef4f1] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                Attribution evidence
              </p>

              <div className="mt-2 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#253642]">
                    {strongestSignal?.label ??
                      "No individual signal available"}
                  </p>

                  <p className="mt-1 text-xs text-[#718083]">
                    Strongest available
                    supporting signal
                    across the ranked
                    candidates.
                  </p>
                </div>

                {strongestSignal && (
                  <span className="text-lg font-semibold text-[#246d68]">
                    {formatScore(
                      strongestSignal.score,
                    )}
                  </span>
                )}
              </div>

              <p className="mt-3 text-[10px] leading-5 text-[#667779]">
                Source scores are
                fused prototype
                ranking values
                supplied by the
                current dataset.
                They should not be
                interpreted as
                probabilities or
                definitive proof of
                responsibility.
              </p>
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                    Candidate sources
                  </p>

                  <h2 className="mt-1 text-sm font-semibold text-[#253642]">
                    Ranked attribution
                    candidates
                  </h2>
                </div>

                <span className="text-[10px] text-[#7a8788]">
                  Top{" "}
                  {
                    reportRows.length
                  }
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#d5dcd7] bg-white">
                {reportRows.length ? (
                  reportRows.map(
                    (row) => (
                      <div
                        key={`${row.source}-${row.rank}`}
                        className="grid grid-cols-[34px_1fr_auto] items-center gap-3 border-b border-[#e2e6e2] px-4 py-3 last:border-b-0"
                      >
                        <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#e8efeb] text-xs font-bold text-[#3d706b]">
                          {
                            row.rank
                          }
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-[#253642]">
                            {
                              row.source
                            }
                          </p>

                          <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[#7a8788]">
                            {
                              row.type
                            }{" "}
                            ·{" "}
                            {
                              row.evidence
                            }
                          </p>
                        </div>

                        <p className="text-sm font-semibold text-[#253642]">
                          {
                            row.score
                          }
                        </p>
                      </div>
                    ),
                  )
                ) : (
                  <p className="px-4 py-5 text-xs text-[#718083]">
                    No candidate
                    source records
                    are available.
                  </p>
                )}
              </div>
            </section>

            <section>
              <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                Evidence notes
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#d5dcd7] bg-white p-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-[#879394]">
                    Detection
                  </p>

                  <p className="mt-1 text-xs font-semibold text-[#344b4e]">
                    {formatScore(
                      slick.detection_confidence,
                    )}{" "}
                    model confidence
                  </p>
                </div>

                <div className="rounded-xl border border-[#d5dcd7] bg-white p-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-[#879394]">
                    Slick confidence
                  </p>

                  <p className="mt-1 text-xs font-semibold text-[#344b4e]">
                    {formatScore(
                      slick.slick_confidence,
                    )}{" "}
                    overall confidence
                  </p>
                </div>

                <div className="rounded-xl border border-[#d5dcd7] bg-white p-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-[#879394]">
                    Review
                  </p>

                  <p className="mt-1 text-xs font-semibold text-[#344b4e]">
                    {slick.hitl_reviewed ===
                    true
                      ? "Human reviewed"
                      : "Awaiting review"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#d5dcd7] bg-[#eef4f1] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#718083]">
                Analyst interpretation
              </p>

              <p className="mt-2 text-sm leading-6 text-[#344b4e]">
                This report combines
                the available detection
                confidence, slick
                confidence,
                candidate-source
                ranking, AIS
                correlation and
                prototype drift
                geometry for
                investigation support.
                Attribution values are
                fused prototype scores,
                not probabilities or
                definitive proof.
              </p>
            </section>

            <footer className="border-t border-[#d5dcd7] pt-4 text-[9px] leading-4 text-[#879294]">
              MarineEye prototype ·
              Generated from the
              currently loaded
              investigation dataset.
            </footer>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}