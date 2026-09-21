const SIGNAL_DEFINITIONS = [
  { key: "proximity", label: "Proximity" },
  { key: "trajectory_match", label: "Trajectory match" },
  { key: "cpa", label: "CPA" },
  { key: "tcpa", label: "TCPA" },
  { key: "drift_overlap", label: "Drift overlap" },
  { key: "ais_gap", label: "AIS gap" },
  { key: "ais_gap_anomaly", label: "AIS gap" },
  { key: "behavior", label: "Behavior" },
  { key: "behavioral_anomaly", label: "Behavior" },
];

export const safeScore = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const normalized = number > 1 ? number / 100 : number;

  return Math.max(0, Math.min(1, normalized));
};

export const formatScore = (value) => {
  const score = safeScore(value);

  return score === null
    ? "—"
    : `${Math.round(score * 100)}%`;
};

export const formatFactor = (value) => {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (!key) {
    return "No dominant signal";
  }

  const definition = SIGNAL_DEFINITIONS.find(
    (item) => item.key === key,
  );

  if (definition) {
    return definition.label;
  }

  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const getAttributionSignals = (source) => {
  const values =
    source?.sub_scores &&
    typeof source.sub_scores === "object"
      ? source.sub_scores
      : source ?? {};

  const seen = new Set();
  const signals = [];

  for (const definition of SIGNAL_DEFINITIONS) {
    const canonicalKey =
      definition.key === "ais_gap_anomaly"
        ? "ais_gap"
        : definition.key === "behavioral_anomaly"
          ? "behavior"
          : definition.key;

    if (seen.has(canonicalKey)) {
      continue;
    }

    const rawValue =
      values[definition.key] ??
      source?.[definition.key];

    const score = safeScore(rawValue);

    if (score !== null) {
      seen.add(canonicalKey);

      signals.push({
        key: canonicalKey,
        label: definition.label,
        score,
      });
    }
  }

  return signals;
};

export const getStrongestSignal = (source) => {
  const explicit = String(
    source?.dominant_factor ?? "",
  ).trim();

  if (explicit) {
    return formatFactor(explicit);
  }

  const signals = getAttributionSignals(source);

  if (!signals.length) {
    return "No individual signal available";
  }

  return [...signals].sort(
    (a, b) => b.score - a.score,
  )[0].label;
};

export const getSourceScore = (source) =>
  safeScore(
    source?.fused_score ??
      source?.score,
  );

export const rankSources = (
  sources,
  limit = 3,
) =>
  (Array.isArray(sources)
    ? [...sources]
    : []
  )
    .sort(
      (a, b) =>
        (getSourceScore(b) ?? -1) -
        (getSourceScore(a) ?? -1),
    )
    .slice(0, limit);