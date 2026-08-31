# Khalid's proposed solution:
The problem statement lists 3 main objectives: 
1. detecting and determining properties of the oil spill.
2. bakctracking point of origin and time and then predicting future flow of spill.
3. Analysing and attributing the spill to a vessel using historic AIS data. 

The solution lies in the exact sequence of this problem statement. 
### Layer 1: Detection and Classification
The Sentinel-1 data in the Eastern Mediterranean Sea provides a balanced dataset of images with 5 classes: sea surface, oil spill, look-alike, ship, and land, with oil spills in cyan, look-alikes in red, ships in brown, and land in green, annotated using European Maritime Safety Agency records and human identification.
Primarily, oil and look-alike detection and classification will be done from this dataset. Reassuringly, this dataset has been cited and used by other research papers that obtained models achieving significant metric scores in oil-spill detection. 
The detection and classification of ships will be extracted from this dataset and not AIS.

### Layer 2: Backtracking and flow prediction
This is a computationally relieving task as it employs Lagrangian particle-tracking simulation, using:
- surface currents + wind (Copernicus Marine Service / CMEMS reanalysis)
- wind/wave reanalysis (ERA5)
- the detected spill polygon's centroid/extent + SAR acquisition timestamp as the seed
This layer provides us with an estimated point of origin and time. 

### Layer 3: Culprit matching and ranking

The point of origin and time provided by Layer 2 gives us a window of spatio-temporal pinpoint which we can use to query regional AIS coverage data via API (Global Fishing Watch has usable coverage). This AIS-like data is then processed as shown in research paper: **Classification-Aided SAR and AIS Data Fusion for Space-Based Maritime Surveillance by Maximilian Rodger and Raffaella Guida** (see 2.2. AIS Data Processing section in the research paper)

This is a two-step ranking approach used to correlate SAR-derived detections (or backtracked spill origins) with AIS vessel tracks:

**Step 1: Geometric (m-best) assignment (GNN / Jonker-Volgenant)**
- Build a cost matrix of geodesic distances between each SAR detection and all candidate AIS reports in the same space-time window.
- Solve the linear assignment problem via the Jonker–Volgenant algorithm (Hungarian-algorithm variant) to minimize total pairing distance.
- Instead of keeping only the single best match, retain the **top-3 closest AIS candidates (m=3)** per SAR detection, ranked by increasing distance.

**Step 2: Confidence-based re-ranking**
- For each of the 3 candidates, compare static attributes against the SAR-derived detection:
  - Length/width agreement (within a threshold *t*)
  - Ship-type/class agreement
- Assign a confidence score based on how many attributes agree.
- Select the candidate with the **highest confidence**, not necessarily the closest one; ties are broken by distance rank.

---
2.2. AIS Data Processing

---
