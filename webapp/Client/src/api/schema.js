/**
 * @typedef {Object} Slick
 * @property {string} id
 * @property {Object} polygon
 * @property {'infrastructure'|'natural_seep'|'coincident_vessel'|'recent_vessel'|'old_vessel'|'ambiguous'} class
 * @property {number} detection_confidence
 * @property {number} slick_confidence
 * @property {number} area
 * @property {number} age_estimate
 * @property {string} timestamp
 * @property {boolean} hitl_reviewed
 * @property {DriftCone} drift
 * @property {Source[]} sources
 */

/**
 * @typedef {Object} DriftCone
 * @property {{t_offset_hours: number, center: [number, number], radius_km: number}[]} hindcast
 * @property {{t_offset_hours: number, center: [number, number], radius_km: number}[]} forecast
 */

/**
 * @typedef {Object} Source
 * @property {string} id
 * @property {'vessel'|'dark_vessel'|'infrastructure'} type
 * @property {Object} sub_scores
 * @property {number} sub_scores.cpa
 * @property {number} sub_scores.tcpa
 * @property {number} sub_scores.drift_overlap
 * @property {number} sub_scores.ais_gap_anomaly
 * @property {number} sub_scores.behavioral_anomaly
 * @property {number} fused_score
 * @property {string} dominant_factor
 * @property {boolean} navic_tracked
 */

/**
 * @typedef {Object} AISTrack
 * @property {string} vessel_id
 * @property {string|null} related_source_id
 * @property {[number, number][]} positions
 * @property {string[]} timestamps
 * @property {number} speed
 * @property {number} heading
 */

export const SLICK_CLASSES = [
  "infrastructure",
  "natural_seep",
  "coincident_vessel",
  "recent_vessel",
  "old_vessel",
  "ambiguous",
];

export const SOURCE_TYPES = ["vessel", "dark_vessel", "infrastructure"];
