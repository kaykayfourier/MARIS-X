# End-to-End Pipeline: SAR Oil Spill Detection, Segmentation, and Attribution

**Sources this document consolidates:**
- Our existing `Preprocessing_Report.md` (Stage 1 image pipeline + Stage 2 oceanographic enrichment + age estimation)
- Yang, Singha & Goldman (2024), *"A near real-time automated oil spill detection and early warning system using Sentinel-1 SAR imagery for the Southeastern Mediterranean Sea"*, Int. J. Remote Sensing 45(6):1997–2027 - referred to below as **"the paper"**
- Our team's own recommended mask-generation approach (Option 1: rule-based dark-pixel segmentation; Option 2: manual annotation as validation/bonus)

This is the full pipeline from raw Sentinel-1 download through to a georeferenced polygon and (eventually) vessel attribution - every stage, in order, with what to do and why.

---

## Stage 0 - Data ingestion

> **Note - this is not training data.** DARTIS (used in Stage 3) is a fixed, one-time-downloaded training/validation dataset covering the Eastern Mediterranean. Stage 0 is a completely separate, continuously-running data stream: it pulls *live* Sentinel-1 scenes over the actual area we're monitoring (the Indian coastline). Training teaches the model/rules what oil looks like; Stage 0 is what feeds the trained/tuned pipeline the real scenes it needs to check. Skipping Stage 0 means having a working detector with nothing to run it on - DARTIS never touches Indian waters.

**What:** Download raw Sentinel-1 GRD products (VV/VH, IW mode) covering the target area and date range.

**Why:** Everything downstream depends on having the right raw scenes. The paper's system automates this download step as part of its "satellite data processing subsystem."

**Notes for our system:**
- Given India's ~6-day Sentinel-1 revisit (current constellation: Sentinel-1C + Sentinel-1D), "real-time" realistically means "process each new scene as it's published," not continuous monitoring.
- The paper found that skipping their mosaic-building step and working directly on individual preprocessed scenes would speed up their system - worth keeping in mind for our own real-time design (see Stage 9).

---

## Stage 1 - SAR image preprocessing (image-only pipeline)

*This is Stage 1 from our existing `Preprocessing_Report.md`, restated here so this document is complete standalone. This matches the SNAP-based pipeline the paper also uses (Section 2.1: border noise removal → thermal noise removal → calibration → ellipsoid correction → dB conversion).*

| Step | What | Why |
|---|---|---|
| 1.1 Border noise removal | Strip corrupted edge pixels from the raw scene | Scene edges are unreliable radar-antenna artifacts; leaving them in teaches the model to associate "edge" with irrelevant patterns |
| 1.2 Thermal noise removal | Subtract the sensor's internal noise floor | Oil = low backscatter (dark); residual noise artificially brightens dark regions, hurting detection of thin/old slicks |
| 1.3 Radiometric calibration | Convert raw digital numbers → calibrated σ0 backscatter in dB | Makes "dark = oil" threshold mean the same thing across every scene, not just the one it was tuned on |
| 1.4 Multilooking (factor 2) | Average adjacent "looks" of the same scene | Reduces SAR speckle graininess at a modest resolution cost |
| 1.5 Contrast normalization | Sigmoid stretch to 0–255, midpoint = scene median, spread = 3× scene std dev | Robust to outlier pixels (bright ships, dark shadows); keeps training input consistent with how annotators judged the labels |
| 1.6 Ellipsoid/terrain correction | Geometric correction so image lines up with real coordinates | Required before any lat/lon-based work downstream (georeferencing in Stage 5 depends on this being correct) |

**Optional refinement - gamma0 vs sigma0:** if incidence-angle normalization matters for a wide-swath scan (it does for us, scanning the whole Indian coastline), convert σ0→γ0 using the incidence-angle band:
```
gamma0(dB) = sigma0(dB) - 10*log10(cos(incidence_angle))
```
This is the ellipsoidal approximation - good enough for open water; full DEM-based terrain correction (RTC) matters more for hilly coastal/island terrain (e.g. Andaman).

---

## Stage 2 - Standard ML-pipeline steps (dataset preparation)

*Also from our existing report - these apply regardless of dataset.*

| Step | What | Why |
|---|---|---|
| 2.1 Annotation format conversion | Convert DARTIS's Pascal VOC XML boxes to our model's expected format (YOLO .txt, COCO JSON, etc.) | Mismatched schemas cause silent training failures |
| 2.2 Land masking | Mask out land in every scene | Land has wildly variable backscatter and isn't a valid detection target; can visually resemble dark patches |
| 2.3 Train/val/test split by scene | Never let patches from the same original scene appear in both train and test | Prevents the model "cheating" via scene-specific artifacts (sensor noise, coastline shape) instead of learning real features |
| 2.4 Class balance handling | Check oil vs. no-oil patch ratio; oversample/undersample/weighted loss if skewed | DARTIS is close to balanced (1,365 oil / 2,990 no-oil), but sub-categories may not be |
| 2.5 Data augmentation | Flips, rotations, mild brightness/contrast jitter - training set only | Small datasets (a few thousand patches) benefit from more variation, but **see the paper's finding below** - augmentation isn't a free win |

**Important finding from the paper (Section 3.1.2):** rotation augmentation (90°/180°/270°) **helped detect large slicks but made small-slick detection worse**. Don't assume augmentation uniformly helps - test its effect on small vs. large objects separately before committing to it.

---

## Stage 3 - Training the object detector

> **Data source for this stage: DARTIS only.** This is the one stage in the whole pipeline that uses DARTIS. Everything from Stage 4 onward runs on Stage 0's live Indian-coast scenes, not on DARTIS.

*This follows the paper's Section 2.2 methodology directly, since it's a validated, published approach for this exact dataset type.*

1. **Crop training patches** around each labeled oil object, sized to match your detector's input (the paper used 640×640px to match YOLOv4's expected input).
2. **Train a one-class detector** (YOLOv4 in the paper; YOLOv8/v10 or similar are reasonable modern substitutes) to detect "oil object" boxes.
3. **Critical trick - add a `no-oil set`:** training only on patches that contain oil teaches the model that *any* dark patch is oil. Add a second set of patches containing look-alikes (algae, low-wind calm zones, radio interference, etc.) **with no oil label at all** - the model learns these are "nothing." The paper measured this directly: adding the no-oil set dropped calibrated false-discovery rate from 69.2% to 21.0%. This is a big, cheap, proven win - do this.
4. **Filter out tiny objects** below a size threshold (~20px) - these are too small to be reliably learned and just add noise to training.
5. **Test data augmentation's effect on small vs. large objects separately** (see Stage 2 caveat above) before deciding whether/how to use it.

**Our situation vs. the paper's:** the paper trains its own detector because they have thousands of labeled boxes with time to train. Given our tighter timeline, this Stage 3 training step is a **stretch goal**, not a blocker - our main polygon-generation path (Stage 5, Option 1 below) doesn't require a trained detector at all. Use DARTIS boxes as a starting ROI regardless of whether we train our own detector.

---

## Stage 4 - Full-scene detection strategy (if using a trained detector)

*Paper Section 2.3.1 - relevant if/when Stage 3's detector exists; skip if going straight to Option 1 below using DARTIS's existing boxes.*

1. Slide a moving window across each new scene (640×640px patches, ~600–1200px stride depending on window size).
2. Rescale each patch to 8-bit (0–255) so backscatter differences between passes don't confuse the model.
3. Run the trained detector on each patch.
4. If a detection is too close to a patch edge, or covers too much of the patch, **automatically re-crop a better-centered/larger patch** and re-check. Repeat until every detection fits cleanly. This avoids cutting a slick in half at a patch boundary.

---

## Stage 5 - Mask and polygon generation (the core problem this document is solving)

This is where the team's recommended approach and the paper's own method converge - **they are the same idea**. The paper doesn't train a U-Net either; it uses a rule-based, no-training segmentation step to turn boxes into masks (Section 2.3.2). This validates going with **Option 1** as the primary approach.

### Option 1 (PRIMARY): Rule-based dark-pixel segmentation - no training required

**Core idea (team's framing):** look inside the box, find pixels darker than the surrounding water, group the connected dark pixels - "the magic wand tool," not a trained model.

**Step-by-step (combining the paper's method with the team's proposed safeguards):**

1. **Define the ROI.** Take the detection box (from DARTIS or your own detector) and expand it by a **small margin only - 10–20%** (team's recommendation; keeps unrelated dark areas out of the ROI, unlike a large blind expansion).
2. **Speckle-reduce the ROI** with a median filter (5×5 to 10×10px depending on ROI size) - this is standard SAR denoising, matches both the paper's approach and our own Sentinel-1 notebook's speckle-smoothing step.
3. **Remove bright outliers using CFAR** (Constant False Alarm Rate): compare each pixel to the mean/std of a surrounding background ring; anything abnormally bright (ships, land edges) gets masked and replaced with the local average so it doesn't interfere with the next step.
4. **Compute local discontinuity** via the power-to-mean ratio (σ/μ) - this reveals the boundary between the smoother oil-damped surface and the rougher open water.
5. **Select seed pixels** - points confidently inside the dark region based on the discontinuity measure.
6. **Region-grow from the seeds** - expand outward, adding any neighboring pixel whose backscatter statistics are similar enough to the current region, until no more similar pixels can be added. This produces the raw binary mask.
7. **Apply the team's additional filters** to control false positives (these are not in the paper, but are sound engineering additions):
   - **Keep only the single largest connected blob nearest the box center** - discard small isolated dark specks elsewhere in the ROI.
   - **Shape check** - real slicks are usually elongated/streaky. If the detected blob is highly round/compact, lower its confidence score rather than treating it as equally reliable.
   - **Compare against DARTIS's no-oil set** (look-alike collection) - check whether the final mask's shape/texture resembles a known look-alike category; flag if so.
   - **Attach a confidence flag to every mask** (`high confidence` vs. `possible look-alike`) rather than claiming certainty. This mirrors the paper's own calibrated-FDR framing - distinguishing "imprecise box" false positives from "targeting a real look-alike" false positives.

**Known failure modes to watch for (from the paper's discussion, Section 4):**
- Calm-water patches (low wind) look dark too, with no oil present - worst month in the paper was December (low wind).
- Biogenic slicks (algae) are regionally concentrated - the paper's EastCoast zone had high false-discovery rate specifically from algae.
- Ship wakes get confused with slicks in busy shipping lanes - the paper's SouthCoast zone (heavy traffic) had this problem, causing the detector to become overly conservative and miss real oil.
- **Mitigation used by the paper (and worth adopting later):** chlorophyll data to flag likely-algae zones, and ship/AIS data to flag likely-wake zones. This is exactly Stage 2's oceanographic enrichment from our existing report - Option 1's mask output feeds directly into that discrimination layer.

### Option 2 (VALIDATION / BONUS, not required): Manual annotation

1. Hand-annotate 50–100 patches pixel-by-pixel using CVAT or LabelImg.
2. Use this as a **validation answer key** to measure Option 1's real accuracy (IoU/Dice against these true masks) - this is essential regardless of which segmentation method we ship, because training and evaluating on the same weak labels would make any reported accuracy meaningless.
3. **Only if time allows:** use this small hand-labeled set to train a lightweight U-Net, purely as a stretch-goal comparison against Option 1. Not required for the core deliverable.

**Bottom line on Options 1 vs. 2:** Option 1 is the main polygon-generation engine - no training needed, directly produces a mask from dark pixels. Option 2 exists to validate Option 1 and, only as a bonus, to explore whether a trained model beats the rule-based approach.

---

## Stage 6 - Contour tracing and georeferencing → GeoJSON polygon

*The common final step for either Option 1 or Option 2 - a mask is still just an image, not a map-ready polygon.*

1. **Contour tracing** - trace the mask's outline to extract corner/vertex points. `cv2.findContours` (OpenCV) does this directly - free, simple, one function call.
2. **Georeferencing** - the traced outline is in pixel coordinates; convert to real latitude/longitude using the Sentinel-1 product's corner/geolocation metadata (the ellipsoid correction from Stage 1.6 must be correct for this to be accurate).
3. **Export as GeoJSON** - package the georeferenced polygon (plus the confidence flag from Stage 5) into a standard GeoJSON feature, ready to render on a map or feed into further analysis (drift simulation, attribution, etc.).

---

## Stage 7 - Look-alike discrimination (Stage 2 oceanographic enrichment)

*From our existing report, Section 4 - this is where wind/SST/chlorophyll data earn their keep, feeding the discrimination layer, never the pixel-level detector.*

| Step | What | Why |
|---|---|---|
| 7.1 Build lookup key | Extract (lat, lon, timestamp) per patch/mask | Join key for attaching external ocean data |
| 7.2 Query ocean data sources | Wind (ERA5), SST (MED DOISST or regional equivalent), chlorophyll-a (CMEMS), currents, wave height, bathymetry | Several look-alikes are *defined* by these conditions (calm wind, biogenic blooms, internal waves) |
| 7.3 Time-matching tolerance | Tight window for fast-changing variables (±3h wind), looser for slow ones (±1 day chlorophyll) | Stale data can mislabel a patch as outside the SAR-visibility window |
| 7.4 Derived features | Convert wind speed into a categorical "inside SAR-visibility window (~2–3 to 7–12 m/s)" flag; compute distance-to-coast, distance-to-known-seep-zones | Classifiers learn faster from meaningful derived flags than raw numbers |
| 7.5 Missing-data handling | Flag (don't silently drop) patches where a data source doesn't cover that location/time | Coastal areas - exactly where hard look-alike cases occur - often have gaps; silently dropping biases training away from the hardest cases |
| 7.6 Feature scaling | Standardize continuous features (fit on training split only) | Prevents scale-mismatch bias (wind in m/s vs. chlorophyll in mg/m³) |

**For India specifically:** swap the Mediterranean-specific sources in our existing report for Indian-Ocean equivalents - INCOIS Ocean State Forecast/ERDDAP (already listed as a resource in our report) is the natural regional substitute for wind/SST/current data over Indian waters.

---

## Stage 8 - Age/weathering estimation (optional, attribution-stage input)

*From our existing report, Section 6 - only relevant once we're past detection/segmentation and into vessel attribution. Summarized here for completeness; full detail is in the source report.*

- No SAR image gives exact age in hours - this is a physics-based inversion (Fay spreading + Mackay/Fingas weathering model run backward), not a direct measurement.
- **Output age as a coarse, uncertainty-bounded bucket**, not a precise number:
  - Fresh: <3h
  - Early weathered: 3–12h
  - Weathered: 12–48h
  - Heavily weathered: >48h
  - Uncertain / insufficient evidence
- Inputs needed: spill area/shape (from Stage 6's polygon), an assumed/bounded oil volume and type, wind speed, SST, current/wave state.
- This age bucket defines the backward-hindcast time window for vessel attribution - get this wrong and you either eliminate the true polluter (window too short) or get an unusably large suspect list (window too wide).

---

## Stage 9 - Evaluation framework

*Adopt the paper's evaluation methodology (Section 3.1) once any validation labels exist (from Stage 5's Option 2 hand-annotated set).*

1. **TP/FP/FN via IoU + confidence thresholds** - a detection counts as a match only if its IoU with a human-confirmed slick passes a threshold *and* its confidence score is high enough.
2. **Calibrated vs. raw FDR/FNR** - the calibrated version only counts a false positive as "bad" if it's targeting a genuine look-alike, not just an imprecise box around a real spill. This separates a localization problem from a real discrimination failure.
3. **Size-stratified evaluation** - report accuracy separately for small/medium/large detections. The paper found large slicks were detected far worse than small ones (14.3% missed, another 64.3% not confident enough) - don't let one blended accuracy number hide this.
4. **Per-hotspot false-positive tracking** - the paper found different regions fail for different reasons (algae-driven false positives in one zone, ship-wake-driven misses in another). Track this per hotspot in our own metadata CSV rather than assuming one global threshold works everywhere.
5. **Drift-based cross-validation (no ground truth needed):** compare a flagged tile against the *next* Sentinel-1 pass over the same area. Real oil drifts coherently with wind/current; noise and most look-alikes don't persist in a moving, shape-consistent way. This is a free plausibility check the paper used (comparing detections to physics-based MEDSLIK trajectory simulation) that we can adapt without needing labeled data.

---

## Stage 10 - Enhancement / next steps for a real-time system

*Directly from the paper's Conclusion (Section 4) - concrete, already-tested ideas for speeding up and improving the pipeline once the core is working.*

1. **Use chlorophyll data to filter algae-driven false positives** before they ever reach a human reviewer.
2. **Bring in ship/AIS wake information** to cut down false positives near busy shipping lanes.
3. **Skip the mosaic-building step; work directly on individual preprocessed scenes** - the paper's mosaic step alone took 10–25 minutes per run; skipping it should meaningfully speed up the system.
4. **Use wind-speed forecasts to prioritize sub-areas** with ideal detection conditions (3–10 m/s) - avoids wasting compute on zones where the physics makes detection unreliable regardless (too calm or too rough).
5. **Benchmark against the paper's own system speed**: ~1.5 hours from SAR download to a full trajectory simulation, on a GPU machine. Useful target for what "near-real-time" should mean for our own system.
6. **Per-hotspot threshold tuning** (our own addition, consistent with Stage 9's finding #4) - don't use one global `CONTRAST_THRESHOLD_DB` for every region; tune per hotspot once enough flagged/validated data exists.

---

## Summary: full pipeline at a glance

| # | Stage | Training required? | Status for our project |
|---|---|---|---|
| 0 | Data ingestion | No | Working (existing notebook) |
| 1 | SAR preprocessing (SNAP-equivalent) | No | Documented in existing report |
| 2 | Dataset prep (annotation, split, balance, augmentation) | No | Needed only if training our own detector (Stage 3) |
| 3 | Object detector training | Yes | **Stretch goal** - not required for core polygon output |
| 4 | Full-scene sliding-window detection | Only if Stage 3 exists | Optional; can use DARTIS boxes directly instead |
| 5 | Mask generation - **Option 1 (rule-based)** | No | **Primary path - build this** |
| 5 | Mask generation - Option 2 (manual annotation) | Optional (U-Net is bonus only) | Validation set; U-Net only if time allows |
| 6 | Contour tracing + georeferencing → GeoJSON | No | Required final step for both options |
| 7 | Look-alike discrimination (oceanographic enrichment) | Yes (classifier) or rule-based flags | Can start rule-based, upgrade later |
| 8 | Age/weathering estimation | No (physics model) | Only needed once attribution stage begins |
| 9 | Evaluation framework | No | Apply once Stage 5 Option 2 validation set exists |
| 10 | Real-time enhancements | No | Apply after core pipeline (Stages 0–6) works end-to-end |
