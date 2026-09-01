# Preprocessing Report

## SAR Oil Spill Detection - DARTIS_2019 + Oceanographic Data + Age Detection

---

## 1. The Big Picture

Our project has two goals:

1. **Detect** oil spills from satellite (SAR) images.
2. **Find out which vessel caused it** (attribution), using AIS ship-tracking data.

To connect these two goals, we need to know **how old the spill is**. Age tells us _when and where_ the oil was likely discharged - without it, we can't search AIS records properly. This is explained in detail in Section 4.

The rest of this report explains how we prepare our data (preprocessing) before training the model.

---

## 2. Two-Stage Preprocessing

We split preprocessing into **two stages** because the model has two different jobs:

| Stage                        | Job                                                                                            | Needs ocean data?     |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| **Stage 1 – Detection**      | "Is this dark patch on the image oil-shaped or not?"                                           | No - image only       |
| **Stage 2 – Discrimination** | "Is it really oil, or something that just looks like oil (calm wind zone, algae, rain, etc.)?" | Yes - wind, SST, etc. |

We keep these separate so we don't confuse the model with data it doesn't need at the detection step.

---

## 3. Stage 1: Preparing the SAR Image (Step by Step)

These steps clean up the raw satellite image before the model ever sees it.

1. **Remove edge noise** - the borders of raw SAR images are often corrupted. We cut this out so the model doesn't learn from bad data.
2. **Remove sensor noise** - every radar has a small built-in "hum" of noise. We subtract it so faint/old oil patches don't get hidden.
3. **Calibrate the image (convert to dB)** - raw numbers aren't comparable between images. Calibration makes "dark = oil" mean the same thing on every scene.
4. **Multilooking (reduce graininess)** - SAR images are naturally grainy (speckle). We average nearby pixels to smooth this out.
5. **Contrast stretch (0–255)** - we rescale brightness values using a smart formula that avoids being thrown off by one very bright or very dark pixel, so the important mid-range details (like oil) stay visible.
6. **Fix the labels format** - convert the dataset's box labels into whatever format our model needs (e.g. YOLO format).
7. **Mask out land** - land isn't a valid target, so we remove it to avoid confusing the model.
8. **Split data properly** - make sure the same original scene doesn't end up in both training and testing sets (otherwise the model can "cheat").
9. **Balance the classes** - check that we have a reasonable mix of oil vs. no-oil examples; fix it if it's too skewed.
10. **Augment the training data** - flip/rotate/adjust brightness slightly on training images only, so the model generalizes better from a small dataset.

**Bottom line:** After these 10 steps, we have a clean, standardized set of images ready to train a basic oil-detector - no ocean data needed yet.

---

## 4. ⭐ Oil Spill Age Detection - Our Differentiator

**This is the part that makes our project stand out**, because most basic detection pipelines stop at "is there oil or not." We go further and estimate **how old the spill is** - which is the missing piece needed for vessel attribution.

### 4.1 Why age matters

A satellite only shows us where oil **is right now** - not where or when it was **discharged**. To find the responsible vessel, we need to search AIS ship records around the discharge point and time, not the detection point and time. **Age tells us how far back to search.**

- If the spill is **fresh**, we search a short time window → fewer, more accurate vessel candidates.
- If the spill is **old/weathered**, we search a wider window → more candidates, but we clearly show it's less certain.

Without age, we'd either miss the real vessel (window too short) or get a useless, huge list of "maybe" vessels (window too wide).

### 4.2 Why exact age is not possible (be honest about this)

There is **no direct way to read "hours since spill" from a satellite image** - it's not like a timestamp. Instead, age has to be **estimated**, using physics.

The best method (comparing the same spill across 2+ satellite passes) needs repeated images of the same slick - which our current dataset doesn't have. So we use the next-best method:

### 4.3 Our approach: Single-image age estimation

We estimate age from **one SAR image**, using both physics and visual clues.

**The 5-step workflow:**

1. **Detect the spill shape** - get its area, perimeter, and how "broken up" it looks.
2. **Guess the oil type and amount spilled** - using context or a reasonable range.
3. **Get the weather/ocean conditions** at that time - wind speed, sea temperature, wave state.
4. **Run an oil-spreading physics model backward** - the model predicts how a spill grows and changes over time; we run it in reverse to estimate how much time would explain the shape we see.
5. **Convert the result into an age category** (not an exact number):
   - Fresh: under 3 hours
   - Early weathered: 3–12 hours
   - Weathered: 12–48 hours
   - Heavily weathered: over 48 hours
   - Uncertain (not enough evidence)

**Visual clues that support the estimate:**

- **Bigger, more spread-out patch** → usually older
- **Compact, single blob** → usually fresher
- **Broken into thin strips/bands** → usually older (wind and waves break slicks apart over time)
- **Smooth, solid dark area** → could be a thicker/fresher layer (but be careful - a heavily weathered oil-water mix can look similar)

### 4.4 Important caveat (we say this honestly, not hide it)

A single image **cannot give an exact age in hours** - different combinations of spill size, oil type, and weather can produce very similar-looking slicks. So we always report age as a **range or category**, never a fake precise number. This is also how real oil-spill response organizations (like the Bonn Agreement) report it - as a weathering stage, not an exact time.

### 4.5 How this helps vessel attribution - the actual payoff

1. **Sets the search window** for backward drift analysis (fresh = short window, old = long window).
2. **Reduces false matches** by being upfront about uncertainty when the spill is older.
3. **Improves AIS matching** - we only check vessels that were near the estimated origin point during the likely discharge window.
4. **Makes results explainable** - instead of "vessel X is guilty," we can say "spill was likely 3–12h old, origin point was here, and vessel Y matched that time-location window."
5. **More legally defensible** - an honest, uncertainty-aware estimate is far more trustworthy than a fake precise number.

### 4.6 Existing tools we build on (we don't start from scratch)

No tool exists that takes a satellite photo and directly outputs "age in hours" - this problem isn't pre-solved. But these tools give us the physics engine to build our age-estimation on top of:

- **NOAA GNOME / PyGNOME / ADIOS** - open-source oil drift & weathering simulator, plus a database of real oil properties.
- **OpenDrift / OpenOil** - similar open-source drift/weathering engine, can use live ocean current & wind data.
- **MEDSLIK-II** - a proven oil-spill model already used for our region (Mediterranean).
- **ESA SNAP** - gives us the clean slick shape/area we need as an input to the age model.
- **Bonn Agreement Oil Appearance Code** - an official standard for classifying weathering stage by appearance, which matches how we plan to report our own age buckets.

---

## 5. Stage 2: Adding Ocean Data (Oceanographic Enrichment)

This stage only feeds the "is it really oil?" step and the age-estimation step - never the basic detector.

1. **Get location + time for each image** - already included in our dataset.
2. **Look up ocean conditions at that location and time**, using free, verified data sources:

| Data                          | Source                | Detail Level           |
| ----------------------------- | --------------------- | ---------------------- |
| Wind speed/direction          | ERA5                  | Hourly                 |
| Sea surface temperature       | Copernicus MED DOISST | Hourly                 |
| Chlorophyll (algae indicator) | Copernicus            | Daily                  |
| Ocean currents                | Copernicus MEDSEA     | Hourly                 |
| Wave height                   | Copernicus Med-WAV    | Hourly                 |
| Sea floor depth               | GEBCO / EMODnet       | Fixed (doesn't change) |

3. **Match data carefully by time** - use tighter time windows for fast-changing data (wind) and looser windows for slow-changing data (chlorophyll).
4. **Turn raw numbers into simple useful flags** - e.g., "is wind speed inside the range where oil is visible on SAR?" (roughly 2–12 m/s) is more useful to the model than the raw number alone.
5. **Flag missing data instead of dropping it** - coastal areas often have gaps, and coastal areas are exactly where tricky look-alikes happen, so we don't want to lose that data.
6. **Scale all values to the same range** before feeding them to the model, so no single variable (like temperature) unfairly dominates just because its numbers are bigger.

---

## 6. Summary Table

| Stage   | What happens                                     | Why                                              |
| ------- | ------------------------------------------------ | ------------------------------------------------ |
| 1       | Clean and standardize SAR images                 | So the model sees consistent, reliable input     |
| 1       | Fix labels, split data, balance classes, augment | Standard good ML practice                        |
| **Age** | **Estimate spill age from shape + physics**      | **Tells us where/when to search for the vessel** |
| 2       | Attach wind, SST, currents, waves, depth         | Helps tell real oil apart from look-alikes       |

---

## 7. Key Takeaway

A basic detector only needs clean images - that's Stage 1. But two things make our project genuinely useful for the real task (finding the responsible vessel): **Stage 2 ocean-data fusion** (to correctly separate oil from look-alikes) and **age detection** (to know how far back in time to search). Age detection especially is what turns a plain "we found oil" system into a "we found oil, and here's roughly when and where it started" system - which is the actual differentiator for this project.

---

For a more detailed explanation of preprocessing Workflow, please refer to the [Detailed Preprocessing Report.md](Detailed%20Preprocessing%20Report.md).
