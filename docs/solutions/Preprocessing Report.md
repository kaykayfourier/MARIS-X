# Preprocessing Pipeline Report

## SAR Oil Spill Detection Model - DARTIS_2019 + Oceanographic Factor Fusion

> Our dataset already follows the same image-first preprocessing logic used in the DARTIS_2019 pipeline: Stage 1 is purely SAR-image preprocessing and does not require wind, SST, or oceanographic data as model inputs. Wind and ocean context are used later only for look-alike discrimination and contextual interpretation, not for the raw detection stage.

## 0\. Why age estimation matters for this PS (read this first)

This PS isn't just "detect oil on a SAR image" - the end goal is **attribution**: working out which vessel caused a given spill. That's what makes age estimation a required capability, not a nice-to-have

- Attribution works by taking a detected slick and asking "which vessel was at the origin point, at the origin time?" - but a satellite only tells you where the oil _is now_, not where or when it was _discharged_.
- **Age is the missing link between "detected now" and "discharged then."** Without an age estimate (even a coarse bucket like "fresh, <3h" or "weathered, 12–48h"), we have no principled way to set the time window for the backward drift/hindcast model, and therefore no principled way to bound which AIS vessel tracks are even relevant candidates.
- A wrong or missing age estimate doesn't just lose you accuracy - it can eliminate the true polluter from consideration entirely (if your search window is too short) or return an unusably large, low-confidence suspect list (if it's too wide, or absent so you have to guess a window).
- This is why age/weathering-stage estimation sits directly upstream of the vessel-attribution/scoring stage in the architecture - it is a **prerequisite input** to the drift-hindcast step, not a separate side-feature.

Given this, age estimation should be scoped deliberately (see the report's companion note on Approach 1 vs. Approach 2, and the Tier 1/2/3 staging) rather than skipped - even a coarse, uncertainty-bounded estimate meaningfully tightens the vessel search space, which is the actual deliverable this PS is scored on.

## 1\. Why preprocessing is split into two tracks

The model has two jobs that need different inputs, so the preprocessing has to be split the same way:

- **Stage 1 (detection/segmentation):** "Is this dark patch on the SAR image oil-shaped or not?" - this only ever looks at pixels.
- **Stage 2 (discrimination):** "Given that it's dark and oil-shaped, is it actually oil, or a look-alike (calm wind zone, biogenic film, internal wave, rain cell, etc.)?" - this is where wind, sea temperature, and other ocean context earn their keep, because several look-alikes are _literally defined_ by ocean conditions.

Keeping these separate matters because if you mix ocean data into Stage 1, you're forcing a pixel-level model to depend on data it doesn't need, which adds noise and failure points for no benefit - the DARTIS_2019 authors themselves trained their baseline detector on images only.

We also want to be explicit about one thing: wind and oceanographic data are not needed to train the detector itself, but they are still necessary for the harder part of the problem. The published DARTIS_2019 dataset ships image patches and object annotations, but it does not attach wind speed, SST, or ocean covariates to each patch. That means a Tier-1 detection model can be trained entirely on image pixels and still perform the basic dark-spot detection task. However, once we move beyond raw detection, the real ambiguity begins: a dark patch can be oil, or it can be a low-wind calm zone, a biogenic film, an internal wave, an upwelling front, or a rain cell. Several of these look-alikes are defined by local wind and ocean conditions, so Stage 2 needs wind, SST, chlorophyll-a, and related context to tell real oil apart from physically similar false positives. In other words, oceanographic data are not required for the image-model training step, but they are essential for the second-stage discrimination and attribution layer that makes the system operationally useful.

## 2\. Stage 1 preprocessing - image-only pipeline

This is the pipeline the DARTIS_2019 paper itself uses (ESA SNAP Graph Processing Framework), applied to raw Sentinel-1 GRD products before anything reaches the model.

### Step 2.1 - Border noise removal

**What:** Strip the corrupted/invalid pixels along the edges of the raw Sentinel-1 image.  
**Why:** Sentinel-1 GRD products commonly have noisy, unreliable data right at the scene edges (an artifact of how the radar antenna scans). If left in, the model can learn to associate "edge of image" with irrelevant patterns instead of real oil signatures.  
**When:** First step, right after downloading the raw product - nothing else should touch the image before this.

### Step 2.2 - Thermal noise removal

**What:** Subtract the sensor's own internal electronic noise floor from the signal.  
**Why:** Radar receivers add a baseline hum of noise on top of the real backscatter signal. Oil spills show up as _low_ backscatter (dark patches), so if you don't remove this noise floor, the low-backscatter regions get artificially "brightened" by residual noise and can look less oil-like than they are - hurting detection of thin/old slicks especially.  
**When:** Immediately after border removal, still on the raw digital-number image.  
**Known caveat:** SNAP v8 introduces small circular artifacts in low-backscatter areas during this step. The dataset authors chose to keep affected patches rather than discard them (for a more realistic noise profile) - worth being aware of if your model shows odd circular false positives.

### Step 2.3 - Radiometric calibration

**What:** Convert the raw digital numbers into physically meaningful backscatter values (σ0, "sigma-naught"), reported in decibels (dB).  
**Why:** Raw digital numbers depend on sensor-specific settings and aren't comparable across scenes or over time. Calibrated σ0 values are physically standardized, so a "dark = oil" threshold means the same thing on any Sentinel-1 scene, not just the one it was tuned on. This is what actually makes the backscatter values meaningful and comparable.  
**When:** After noise removal, before multilooking.

### Step 2.4 - Multilooking (factor 2)

**What:** Average together adjacent "looks" (sub-images) of the same scene.  
**Why:** SAR images are inherently grainy due to speckle noise (a physical side-effect of the radar imaging process, not sensor error). Averaging looks reduces this graininess substantially, at the cost of some spatial resolution. A factor of 2 is a reasonable trade-off - cleaner signal without losing too much detail on smaller slicks.  
**When:** Last SNAP-side step, after calibration; scenes are then assembled into continuous images.

### Step 2.5 - Contrast normalization (sigmoid stretch)

**What:** Rescale the calibrated dB values into the standard 0–255 image range using a **sigmoid stretch**, not a simple linear rescale - midpoint set to the scene's own median, spread set to 3× the scene's own standard deviation.  
**Why:** A plain linear stretch (min→0, max→255) gets thrown off by extreme outlier pixels (e.g. a very bright ship or a very dark shadow), squashing the useful mid-range contrast where oil signatures actually live. A sigmoid stretch centered on the median is more robust to those outliers and produces a per-scene adaptive contrast that's what the human annotators actually judged the labels against - so training on the same stretch keeps the model consistent with how the ground truth was created.  
**When:** Final step before the image is fed to the detector; this is scene-specific (recomputed per image, not a fixed formula for the whole dataset).

## 3\. Stage 1 preprocessing - standard ML-pipeline steps (beyond the SAR-specific ones)

These aren't unique to oil spill detection, but they're necessary regardless of dataset:

### Step 3.1 - Annotation format conversion

**What:** DARTIS_2019 ships Pascal VOC XML bounding boxes. Convert to whatever format your model architecture expects (e.g. YOLO .txt format via the dataset's own toolbox scripts, or COCO JSON for other frameworks).  
**Why:** Every detection framework expects a specific annotation schema; mismatches cause silent training failures or garbage results, not clean errors.

### Step 3.2 - Land masking

**What:** Mask out land areas in each scene (the toolbox includes a script for this).  
**Why:** Land has extremely variable backscatter and isn't a valid detection target - including it as background noise dilutes what the model learns about actual sea-surface patterns, and land can sometimes visually resemble dark patches.

### Step 3.3 - Train/validation/test split

**What:** Split patches so the same underlying SAR scene never appears in both train and test sets.  
**Why:** If patches cropped from the same original scene end up split across train and test, the model can "cheat" by memorizing scene-specific artifacts (sensor noise pattern, specific coastline shape) rather than learning general oil-vs-not features - inflating your reported accuracy without it being real.

### Step 3.4 - Class balance handling

**What:** Check the oil vs. no-oil (look-alike) patch ratio; apply oversampling, undersampling, or weighted loss if it's skewed.  
**Why:** DARTIS_2019 is close to balanced (1,365 oil-set vs 2,990 no-oil-set patches, roughly 1:2), but within the oil-set, the look-alike sub-categories (from the paper's K-means clustering) may be unevenly represented - if you're doing fine-grained look-alike classification later (Stage 2), check that sub-balance too.

### Step 3.5 - Data augmentation

**What:** Random flips, rotations, and mild brightness/contrast jitter on the training set only.  
**Why:** SAR datasets of this size (a few thousand patches) are small by deep-learning standards. Augmentation exposes the model to more variation without needing more real data, and reduces overfitting to the exact orientation/scale of training examples. Avoid augmentations that would break the physical meaning of the image (e.g. don't randomly rescale intensity ranges outside realistic dB bounds).

## 4\. Stage 2 preprocessing - oceanographic factor enrichment

This runs _in addition to_ Stage 1's pipeline, and only feeds the look-alike discrimination step - never the pixel-level detector. The steps below are now backed by confirmed, 2019-covered data sources (research findings, Aug 2026).

### Step 4.1 - Build a lookup key per patch

**What:** For every patch, extract (latitude, longitude, acquisition timestamp) from the DARTIS_2019 metadata table.  
**Why:** This is the join key that lets you attach external ocean data to a patch that otherwise has none.

### Step 4.2 - Query gridded ocean data sources by space + time

**What:** For each patch's (lat, lon, timestamp), pull the nearest grid-cell value from the confirmed stack below:

| **Variable**            | **Source (2019-verified)**                                             | **Resolution**  | **Temporal**            | **Access**       |
| ----------------------- | ---------------------------------------------------------------------- | --------------- | ----------------------- | ---------------- |
| 10 m wind (u,v)         | **ERA5** single levels (ECMWF/C3S)                                     | 0.25° (~31 km)  | hourly                  | cdsapi           |
| SST                     | **MED DOISST** (SST_MED_SST_L4_NRT_OBSERVATIONS_010_004)               | 1/16° (~7 km)   | hourly, from 1 Jan 2019 | copernicusmarine |
| Chlorophyll-a           | **CMEMS global L4** (OCEANCOLOUR_GLO_BGC_L4_MY_009_104) or Med L3 1 km | 4 km / 1 km     | daily                   | copernicusmarine |
| Surface currents        | **MEDSEA reanalysis** (MEDSEA_MULTIYEAR_PHY_006_004)                   | 1/24° (~4 km)   | hourly                  | copernicusmarine |
| Significant wave height | **Med-WAV reanalysis** (MEDSEA_MULTIYEAR_WAV_006_012)                  | 1/24° (~4 km)   | hourly                  | copernicusmarine |
| Bathymetry              | **EMODnet DTM 2024** (Med) / GEBCO_2024 (global)                       | ~115 m / ~450 m | static                  | bulk download    |

All six are free (Copernicus/GEBCO/EMODnet open licences), fully cover 2019, and can be queried by (lat, lon, timestamp) - no gap-filling or substitution needed for this specific dataset window.

**Why this specific stack:** it isn't a generic "any wind/SST source will do" choice - MED DOISST's hourly SST record only starts 1 Jan 2019, which happens to align exactly with the DARTIS_2019 window, and MEDSEA's hourly currents are the same forcing already used by validated regional oil-spill models (MEDSLIK-II) - so using it here keeps you consistent with the reference literature rather than introducing an unvalidated data source.

### Step 4.3 - Set a time-matching tolerance per variable

**What:** Use a tight time window for fast-changing variables (e.g. ±3 hours for wind), and a looser window for slow-changing ones (e.g. ±1 day for chlorophyll-a, which is only daily-resolution anyway). SST and currents are now hourly in the confirmed sources above, so they can be matched almost exactly rather than approximated.  
**Why:** Wind fields can shift meaningfully within a few hours; using a stale wind value could mislabel a patch as "outside the SAR-visibility window" when it wasn't at the actual capture time.

### Step 4.4 - Engineer derived features, not just raw values

**What:** Convert raw wind speed into a binary/categorical "inside SAR-visibility window (~2–3 to 7–12 m/s)" flag; compute distance-to-coast and distance-to-known-seep-zones from bathymetry/coastline data.  
**Why:** A classifier often learns faster and more robustly from a meaningful derived flag than from a raw continuous number it has to rediscover the threshold for itself.

### Step 4.5 - Handle missing lookups explicitly

**What:** Flag (don't silently drop) patches where a given data source doesn't cover that location/time - e.g. chlorophyll-a's 1 km Med L3 product has real cloud gaps (it's observation-only, not gap-filled), unlike the 4 km global L4 which is interpolation-filled.  
**Why:** Coastal areas are exactly where a lot of look-alikes (biogenic films, upwelling fronts) occur, so silently dropping rows with missing ocean data would bias your training set away from the hardest, most useful examples. If you use the L4 chlorophyll product to avoid gaps, flag those cells as "interpolated" rather than treating them as real observations.

### Step 4.6 - Scale/normalize ocean features before feeding the classifier

**What:** Standardize continuous ocean features (wind speed, SST, chlorophyll-a) to zero mean/unit variance (or min-max scale), fit on the training split only.  
**Why:** These variables have very different natural ranges (wind in m/s, SST in °C, chlorophyll-a in mg/m³); unscaled inputs bias gradient-based classifiers toward whichever feature happens to have the largest raw numbers, regardless of actual importance.

### Step 4.7 - Recommended Python tooling

**What:** copernicusmarine (Copernicus Marine Toolbox) for SST/chl-a/currents/waves, cdsapi for ERA5 wind, xarray+netCDF4/dask to handle the NetCDF grids, scipy.spatial.cKDTree for fast nearest-neighbour (lat, lon) matching across thousands of patches, and rioxarray/pygmt grdtrack for sampling the bathymetry rasters at points.  
**Why:** These match the actual services each data provider exposes - copernicusmarine's arco-time-series service in particular pulls a point time series far more efficiently than downloading a full bounding-box file per patch, which matters once you're enriching thousands of DARTIS_2019 patches rather than a handful.  
**Practical recipe:** subset all six products once over the full Eastern Med bounding box × 2019 into local NetCDFs, build one cKDTree per grid, then extract each variable at each patch's cell (bathymetry matched once per patch since it's static). Cache the result as a Parquet table rather than re-querying per patch.

## 5\. Summary table

| **Stage** | **Step**                                          | **Applies to**    | **Purpose in one line**                                       |
| --------- | ------------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| 1         | Border noise removal                              | All images        | Remove corrupted edge pixels                                  |
| 1         | Thermal noise removal                             | All images        | Remove sensor's own noise floor                               |
| 1         | Radiometric calibration                           | All images        | Convert to standardized, comparable σ0 dB values              |
| 1         | Multilooking                                      | All images        | Reduce speckle graininess                                     |
| 1         | Sigmoid contrast stretch                          | All images        | Match training input to how labels were annotated             |
| 1         | Annotation conversion                             | Labels            | Match model's expected input format                           |
| 1         | Land masking                                      | All images        | Remove invalid detection targets                              |
| 1         | Train/val/test split by scene                     | Full dataset      | Prevent scene-leakage inflating accuracy                      |
| 1         | Class balance handling                            | Full dataset      | Prevent majority-class bias                                   |
| 1         | Data augmentation                                 | Training set only | Reduce overfitting on a small dataset                         |
| 2         | Lookup key construction                           | Per patch         | Enable joining external ocean data                            |
| 2         | Ocean data query (wind/SST/chl-a/bathymetry/rain) | Per patch         | Attach look-alike-relevant context                            |
| 2         | Time-matching tolerance                           | Per variable      | Avoid stale data for fast-changing variables                  |
| 2         | Derived feature engineering                       | Per patch         | Give the classifier pre-computed, literature-grounded signals |
| 2         | Missing-data handling                             | Per patch         | Avoid biasing training data away from hard coastal cases      |
| 2         | Feature scaling                                   | Full dataset      | Prevent scale-mismatch bias in the classifier                 |

## 6\. Existing tools/resources relevant to oil spill age estimation

There is no off-the-shelf tool that outputs "age in hours" directly from one SAR image - this isn't a solved, packaged problem. But the following existing tools give you the physics/engine you'd wire an age-estimation layer around, rather than deriving everything from scratch:

- **NOAA GNOME / PyGNOME / ADIOS** - open-source (GitHub) Lagrangian drift-and-weathering suite. GNOME's own workflow already includes running the model _backward_ from a known slick to estimate a likely origin time/location - this is the closest existing tool to a ready-made "age via hindcast" engine (Approach 2's core logic). ADIOS additionally supplies real oil-property data (density, viscosity, distillation curves) needed to make the Fay-spreading/weathering fit realistic rather than generic.
- **OpenDrift / OpenOil (MET Norway)** - same category as GNOME: a generic Lagrangian trajectory framework with an oil-specific module (evaporation, emulsification) that can ingest Copernicus Marine current/wind forcing directly. Good alternative/complement engine for building the hindcast-fitting step in Approach 2.
- **Seatrack Web (SMHI)** - an operational Baltic-Sea tool that already implements the classic "backward-drift the slick, then check which vessel's AIS track intersects the backtracked position" workflow - worth studying as a template, though it's Baltic-tuned, not open for direct reuse.
- **SkyTruth Cerulean / Global Fishing Watch Skylight** - doesn't estimate age explicitly, but its "Source Profiles" ranking (top-3 probable vessels per slick, using AIS-off-event history) is evidence of how far a production system pushes the detection→attribution link without solving age estimation outright - a useful benchmark for what's currently considered "good enough" in a deployed tool.
- **ESA SNAP Oil Spill Detection operator** - gives you the calibrated dark-spot polygon and area/shape features (a prerequisite input for any age-inversion approach), but doesn't do age estimation itself.
- **Bonn Agreement Oil Appearance Code (BAOAC)** - not software, but a standardized visual/optical classification (silver sheen → rainbow → brown/black → dark brown mousse) used operationally to bucket weathering _stage_ from appearance. Useful as a coarse, literature-grounded target/label scheme if you want to frame age estimation as a classification problem (weathering class) rather than a regression problem (exact hours).
- **Published backtracking-uncertainty studies** (e.g. Janeiro et al. 2017, validated against real satellite-tracked drifter buoys) - not a tool, but the source for realistic error bounds on "how far back can you trust a hindcast" - important for stating your age/origin-time uncertainty honestly rather than presenting a false-precision number.

**Bottom line:** treat age estimation as something you build on top of an existing drift/weathering engine (GNOME or OpenDrift), not something you find pre-packaged - no current public tool ships a standalone "input SAR image(s), output spill age" function.

### 6.1 Oil-spill age estimation: what we can and cannot measure from a single SAR image

I think the most important point is this: there is **no direct satellite measurement of "hours since spill."** We do not get an exact age number from the image the way we get temperature from a thermometer. What we actually have is an inference problem. We look at the slick as it appears now, then we ask: under the known oil physics and weather conditions, how long would it take for a spill to evolve into this shape and size?

So in practice, we either:

1. **Run the oil-physics model backward** from the detected slick to estimate how much time has elapsed, or
2. **Compare the same slick across multiple satellite passes** if we have them.

But with the dataset we currently have, we do not have multiple SAR scenes of the same spill, so we have to be honest: we are limited to a single-scene estimate. That means we are not dealing with exact hours. We are dealing with a plausible range or a coarse stage.

#### Relevant tools and resources

- **NOAA GNOME / PyGNOME / ADIOS**: https://response.restoration.noaa.gov/software/software.html  
  https://github.com/NOAA-ORR-ERD/PyGNOME  
  https://www.ncei.noaa.gov/products/oil-spill-response
- **OpenDrift / OpenOil**: https://opendrift.github.io/  
  https://github.com/OpenDrift/opendrift
- **Copernicus Marine Data Store**: https://data.marine.copernicus.eu
- **ERA5 / CDS**: https://cds.climate.copernicus.eu
- **ESA SNAP**: https://step.esa.int/main/download/snap-download/
- **INCOIS Ocean State Forecast and ERDDAP**: https://incois.gov.in  
  https://erddap.incois.gov.in/erddap/index.html
- **Bonn Agreement Oil Appearance Code**: https://www.bonnagreement.org/  
  https://www.bonnagreement.org/implementation/oil-spill-response-tools-and-techniques
- **MEDSLIK-II / Mediterranean oil-spill modelling**: https://www.medslik.org/  
  https://www.medslik.org/publications

These are the main public references we can rely on for the age-estimation and drift/weathering workflow.

### 6.2 Approach - single-scene inversion (the realistic option for us)

The idea is simple: we take the observed slick, run the Fay spreading + Mackay/Fingas weathering model backward, and ask, “Given this area, shape, and texture, how much time could have passed since discharge?”

This is not easy, and there are real assumptions involved:

- **An assumed or bounded spill volume** - this is the biggest weakness. Without a volume estimate, area alone is ambiguous. A large spill that is older can look similar to a smaller spill that is younger.
- **Oil type and properties** - density, viscosity, and distillation behavior strongly affect how fast the slick spreads and weathers.
- **Wind speed and sea-surface temperature** - these directly influence evaporation and spreading.
- **Current Fay spreading regime** - we have to infer which physics regime is active rather than just guessing from the image.

In real life, we also use visual clues from the SAR scene to support this estimate. These are not exact ages, but they are useful age-related signals:

- **Fragmentation / shape complexity** - fresh slicks are usually more compact, while older slicks break into narrow bands, windrows, and disconnected patches.
- **Damping-ratio / texture homogeneity** - a strong dark signature can indicate a thick fresh slick or a weathered emulsion, so we have to be careful not to over-interpret it.
- **Optical/thermal appearance** - when we have daylight optical imagery, we can infer a coarse weathering stage, but that still gives us a class, not an exact time.
- **Polarimetric features** - these are more useful for separating oil-type effects than for giving us exact age.

So we should be honest with ourselves: single-image estimation is a **weak but usable inversion**, and we should present it as a rough stage or range rather than a precise age in hours.

### 6.3 Detailed explanation of Approach - what we do with one SAR image

Because our dataset does not contain repeated observations of the same slick, this is the only method that is realistically usable for us. The logic is to treat the detected dark patch as the current state of a slick whose evolution is governed by oil physics. We then estimate how long the spill would have had to evolve under the actual wind, sea-state, and oil properties to reach the observed area, shape, and texture.

Our workflow is basically:

1. **Detect the slick polygon** from the SAR image and measure its area, perimeter, compactness, and fragmentation.
2. **Estimate the oil type and initial spill volume** from context or a bounded prior.
3. **Set the met-ocean conditions** using wind, SST, and sea-state information for the scene time.
4. **Run the Fay spreading + weathering equations backward** to estimate the elapsed time since release.
5. **Convert the estimate into a coarse age class** such as fresh, early weathered, weathered, or heavily weathered.

This is not a direct measurement of age. It is a physics-based inversion, and that is exactly why we need to keep the output uncertainty-aware.

#### 6.3.1 Why this approach still works for us

A slick does not stay the same forever. It spreads, changes shape, fragments, and gets weathered over time. Under gravity, surface tension, wind drift, turbulent mixing, and evaporation, the oil patch changes in measurable ways:

- it spreads laterally,
- its area increases and shape changes,
- its compactness drops,
- it fragments into narrow bands or disconnected blobs,
- its thickness and emulsification change over time.

That means the geometry we see in one image still contains some age signal. The challenge is that the mapping from geometry to age is not unique unless we also constrain volume, oil type, and forcing conditions.

#### 6.3.2 Inputs we need for a single-scene estimate

For a credible single-scene estimate, we need the following:

- **Spill area and shape** from the detected polygon
- **Estimated spill volume or a plausible range**
- **Oil properties** like density, viscosity, and distillation characteristics
- **Wind speed and direction** at the scene time
- **Sea surface temperature**
- **Current regime or wave state**
- **Fay regime classification** for the current spreading state

If we do not have these, then the age estimate becomes too weak to be meaningful.

#### 6.3.3 What visual features in the image help us infer age

Even with one SAR image, we still have a few useful clues:

- **Area and spread radius**: a slick that has been drifting longer usually has a larger footprint.
- **Shape complexity**: fresh slicks are generally more compact; older slicks often break into elongated bands and disconnected clusters.
- **Perimeter-to-area ratio**: this usually increases as fragmentation and irregularity increase.
- **Texture and damping patterns**: a smooth, dense dark region can indicate a thicker or newer slick, while a fragmented or patchy surface often signals a more weathered one.
- **Windrow formation**: if the slick is aligned into narrow strips by wind, it is likely beyond the very fresh stage.

These are not exact age values, but they are still useful ordinal signals when we combine them with the physical model.

#### 6.3.4 The big caveat: one image is not enough for an exact age

This is the most important limitation, and we should say it clearly.

A single SAR image cannot tell us the exact age in hours because different combinations of volume, oil type, and wind history can produce similar-looking slicks. For example:

- a large fresh spill can look similar to a smaller older spill,
- a heavily weathered film can look similar to a thick fresh layer in SAR damping,
- calm sea conditions can make a slick appear more compact than it really is under stronger wind conditions.

So we should output age as a **confidence-bounded range** or **stage bucket**, not as a precise number of hours.

#### 6.3.5 Why this still helps in vessel detection and attribution

Even though the estimate is uncertain, it still helps us in the vessel-attribution problem.

A vessel is not simply the nearest ship to the slick at the image time. The real question is: **which vessel was likely present at the origin time and location?** Age estimation gives us the time window we need for backward drift analysis.

This helps us in a few practical ways:

1. **It defines the hindcast window**  
   If we estimate the slick is fresh, we search a shorter time horizon. That gives us a tighter and more credible vessel list.

2. **It reduces false matches**  
   If the slick is weathered, the search window is wider and uncertainty is higher, so we can reflect that in the ranking rather than pretending the match is exact.

3. **It improves AIS correlation**  
   With a bounded age range, we can check which vessels were in the area during the likely discharge window and whether their trajectories match the backtracked origin point.

4. **It makes the attribution explainable**  
   Instead of saying “vessel X is likely guilty,” we can say: “the slick was likely 3–12 h old, so the likely discharge window was here, and vessel Y was present in that time-space window and matched the drift assumptions.”

5. **It supports legal and operational defensibility**  
   We are not claiming a magic age value. We are using a model-informed estimate with uncertainty, which is far more defensible than pretending that a CNN can read exact spill time directly from a texture map.

So even a rough age estimate adds value. It turns a static detection into a time-bounded vessel-search problem, and that is exactly what we need for attribution.

### 6.4 Recommended scope for this project

Given the dataset we actually have, the realistic strategy is:

- **Treat age as a coarse class rather than an exact number of hours**
- **Use uncertainty-aware output**

Suggested age buckets:

- **Fresh: < 3 h**
- **Early weathered: 3–12 h**
- **Weathered: 12–48 h**
- **Heavily weathered: >48 h**
- **Uncertain / insufficient evidence**

This is the level of rigor that matches the available data and still meaningfully supports vessel detection and attribution.

## 7\. Key takeaway

Stage 1 needs nothing but a clean, correctly calibrated, correctly normalized SAR image - get that right and DARTIS_2019 trains a working baseline detector as-is.

Stage 2 is where the real differentiation lives: enriching patches with wind/SST/chlorophyll-a/bathymetry turns a plain image classifier into one that can actually distinguish oil from the many physically similar things that aren't oil - which is the harder, higher-value problem, and the one your dossier's gap analysis already flags as the differentiator worth building.
