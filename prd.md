# Product Requirements Document (PRD): Cap-to-Community

**Track:** [03 Energy & climate tech](https://hackachusetts2026.vercel.app/#/climate)

**Challenge:** C3 — A more reliable clean energy system (*with C1 Environmental Justice & C2 Clean Energy integration*)

**Target Users:** Massachusetts Town Sustainability Managers, Municipal Energy Committees, and Community Solar Developers

**Core Value Proposition:** A two-stage screening and grant-matchmaking web app that joins Massachusetts landfill renewable projects, electric utility territories, and Environmental Justice (EJ) demographics—then upgrades town-level starter CSVs with live spatial geometry to verify neighborhood proximity and generate a Monday-morning municipal grant brief.

---

## 1. Problem Statement & Opportunity

* **Unconnected Silos:** Capped landfills are prime sites for community solar and battery storage, and Massachusetts offers lucrative state grants and solar incentives for projects benefiting Environmental Justice (EJ) populations. However, municipal planners have to cross-reference separate datasets to see landfill project status, which utility controls the grid connection, and whether their town has qualifying EJ block groups.
* **The "Honest Data Gap" (Town vs. Block Group Resolution):** The starter tables for landfills and EJ block groups contain **no street addresses or coordinates** (`returnGeometry=false`). Joining solely on `MUNICIPALITY` can create a false positive: a town might have both a permitted landfill solar site and an EJ block group, even if they sit on opposite sides of town.
* **The Opportunity:** Build a fast statewide triage table using the starter kit, paired with an on-demand **Spatial Proximity Inspector** that queries the live MassGIS ArcGIS REST endpoints with `returnGeometry=true` to prove actual physical proximity and output an actionable grant application brief.

---

## 2. User Personas & User Stories

| Persona | Monday Morning Goal | User Story |
| --- | --- | --- |
| **Town Sustainability Manager** | Secure state grant funding to turn a stalled (`Permitted` or `Construction`) landfill solar project into an active community solar + storage asset. | *"As a town manager, I want to see if our capped landfill sits near our town's EJ block groups and which utility handles interconnection, so I can generate a grant justification brief in 60 seconds."* |
| **Community Solar / Storage Developer** | Find the highest-impact towns in Eversource, National Grid, or Municipal Light Plant territories to pitch co-located battery storage or community solar. | *"As a developer, I want to filter all 116 landfill sites by project status, utility provider, and local low-income/limited-English metrics so I know where to focus outreach."* |

---

## 3. Data Architecture & Join Specification

### Primary Datasets

1. **Renewables at Massachusetts Landfills** ([Starter Zip](https://hackachusetts2026.vercel.app/#/climate) / [Live MassGIS Endpoint](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/DEP/RenewablesAtMaLandfills/MapServer/0/query?where=1%3D1&outFields=MUNICIPALITY,FACILITY,TYPE_,MW_PERMITTED,MW_OPERATING,STATUS_1,OPERATING_SINCE&returnGeometry=false&f=json))
* **Records:** 116 rows
* **Key Fields:** `MUNICIPALITY`, `FACILITY`, `TYPE_`, `MW_PERMITTED`, `MW_OPERATING`, `STATUS_1`, `OPERATING_SINCE`


2. **Electric Utility by Town** ([Live MassGIS Endpoint](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0/query?where=1%3D1&outFields=TOWN,ELEC,ELEC_LABEL&returnGeometry=false&f=json))
* **Records:** 351 rows (all MA municipalities)
* **Key Fields:** `TOWN` (ALL CAPS), `ELEC_LABEL` (Utility provider name)


3. **MassGIS Environmental Justice Block Groups** ([Live MassGIS Endpoint](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/EJ2020/MapServer/0/query?where=EJ%3D%27Yes%27&outFields=MUNICIPALITY,TOTAL_POP,PCT_MINORITY,LIMENGHHPCT,BG_MHHI,EJ,EJ_CRIT_DESC&returnGeometry=false&resultRecordCount=100&f=json))
* **Records:** 2,604 rows statewide (Starter preview queries `EJ='Yes'`)
* **Key Fields:** `MUNICIPALITY`, `TOTAL_POP`, `PCT_MINORITY`, `LIMENGHHPCT` (Limited-English households %), `BG_MHHI` (Block-group median household income), `EJ_CRIT_DESC`



### Data Normalization & Join Logic

* **Join Key:** Normalize `MUNICIPALITY` and `TOWN` via `.trim().toUpperCase()`.
* **Town-Level Aggregation (Stage 1):**
* Group the 116 landfill rows by normalized town name.
* Join 1:1 with the 351 utility rows to attach `ELEC_LABEL`.
* Aggregate EJ block groups by town to compute:
* `ej_block_group_count`: Total EJ block groups in that town.
* `min_bg_mhhi`: Lowest median household income among the town's EJ block groups.
* `max_lim_eng_pct`: Highest Limited-English household percentage in the town.
* `ej_criteria_summary`: Distinct criteria present (`Income`, `Minority`, `English Isolation`).





---

## 4. Core Functional Requirements (MVP Scope)

### Feature 1: Statewide Opportunity Triage Dashboard (P0)

* **Interactive Filter Bar:**
* Filter by **Project Status**: `Permitted` / `Construction` (stalled/shovel-ready opportunities) vs. `Operating` (candidates for battery storage retrofits).
* Filter by **Electric Utility (`ELEC_LABEL`)**: e.g., National Grid, Eversource, or Municipal Light Plants (MLPs).
* Filter by **EJ Criteria (`EJ_CRIT_DESC`)**: Income, Minority, or Limited-English thresholds.


* **Opportunity Scoring Formula:**
* Calculate an transparent **Equity & Readiness Score (0–100)** for each landfill site:

$$\text{Score} = 40 \times (\text{Status Weight}) + 30 \times (\text{Income Need Percentile}) + 30 \times (\text{EJ Population Share})$$



*(where Status Weight = $1.0$ for Permitted/Construction sites needing a push, and $0.7$ for Operating sites ready for battery storage co-location).*



### Feature 2: The "Honest Data Gap" Spatial Inspector (P0 — Hackathon Differentiator)

* **The Visual Caveat Banner:** Display a clear badge on every town row: *"Town-level match only. Starter CSVs lack street addresses—click 'Verify Proximity' to query live MassGIS geometry."*
* **Live Geometry Upgrade:** When a user selects a town (e.g., Barnstable, Hingham, Dalton, or Carver), fire two live requests to the MassGIS ArcGIS REST endpoints by modifying the query parameters from the starter URLs:
* Set `where=MUNICIPALITY='<Selected Town>'`
* Flip `returnGeometry=false` to `returnGeometry=true`
* Add `outSR=4326` (and `f=geojson` or parse Esri JSON rings/points)


* **Interactive Map View:** Render the exact landfill point marker(s) alongside the shaded EJ block-group polygons and calculate the straight-line distance (in miles/km) from the landfill to the nearest EJ block group boundary.

### Feature 3: Monday-Morning Municipal Grant & Outreach Brief Generator (P0)

* Generate a clean, printable/copyable 1-page action brief tailored to the selected landfill and town:
1. **Project & Grid Summary:** Names the facility (`FACILITY`), current status (`STATUS_1`), permitted/operating megawatts, and the exact utility gatekeeper (`ELEC_LABEL`) that must approve interconnection or storage upgrades.
2. **Neighborhood Equity Justification:** Lists the exact count of EJ block groups in town, lowest median income (`BG_MHHI`), and distance from the landfill to the nearest EJ neighborhood.
3. **Bilingual Outreach Flag:** Automatically triggers a **"Multilingual Enrollment Required"** callout if `LIMENGHHPCT > 5%`, reminding planners that community solar bill credits require translated outreach materials to actually reach renters.
4. **Official State Program Links:** Embeds direct citations to official guidance resources from the portal ([ResilientMass](https://hackachusetts2026.vercel.app/#/climate), [Mass Save data](https://hackachusetts2026.vercel.app/#/climate), [Massachusetts energy data](https://hackachusetts2026.vercel.app/#/climate), and [ISO New England ISO Express](https://hackachusetts2026.vercel.app/#/climate) for peak-demand storage framing).



---

## 5. Technical Stack & Implementation Plan (Hackathon-Ready)

* **Frontend:** React / Next.js or Vite + Tailwind CSS (fast UI scaffolding, clean cards, mobile-responsive layout for town managers on phones).
* **Map Component:** Leaflet (`react-leaflet`) or Mapbox GL JS to render the live GeoJSON/Esri JSON polygons from MassGIS.
* **Data Layer:**
* Load the 3 starter JSON/CSV files locally into memory for instant, zero-latency filtering across all 116 landfills and 351 towns.
* Use browser `fetch()` for on-demand live spatial queries when a user clicks a specific town.



---

## 6. Hackathon Execution Timeline

| Phase | Time Allocation | Deliverable |
| --- | --- | --- |
| **Phase 1: Data & Join Script** | Hours 1–2 | Parse the 3 starter files, normalize `TOWN` / `MUNICIPALITY`, output a unified `landfill_opportunities.json` file. |
| **Phase 2: Triage Dashboard UI** | Hours 3–5 | Build the filterable table, summary metric cards, and Opportunity Score ranking. |
| **Phase 3: Live Spatial Inspector** | Hours 6–8 | Wire up the live MassGIS `returnGeometry=true&outSR=4326` fetch for selected towns and plot points + EJ polygons on a Leaflet map. |
| **Phase 4: Grant Brief & Polish** | Hours 9–10 | Build the dynamic "Monday Morning Grant Brief" drawer with bilingual flags and state resource links; rehearse the 3-minute demo. |

---

## 7. Judge Demo Script (2-Minute Flow)

1. **The Hook (0:00–0:30):** *"Massachusetts wants clean energy on capped landfills and bill relief for Environmental Justice neighborhoods. But if you look at the starter datasets, they have no street addresses—just town names. And before you promise community solar, you have to name the utility that actually delivers the electrons."*
2. **The Triage (0:30–1:00):** Show the statewide dashboard joining all 116 landfill projects with the 351 town utilities and 2,604 EJ block groups. Filter for projects in `Permitted` or `Construction` status or low-MW `Operating` sites in EJ municipalities.
3. **The Honest Caveat + Live Map Reveal (1:00–1:30):** Click a town. Point out the caveat badge explaining that town-level joins can mask neighborhood divides, then trigger the live MassGIS spatial query (`returnGeometry=true`) to show the landfill pin and the EJ block group polygons on screen.
4. **The Actionable Output (1:30–2:00):** Open the auto-generated **Monday-Morning Grant Brief** showing the utility provider name, income/minority stats, automatic bilingual outreach flag (`LIMENGHHPCT`), and direct links to ResilientMass and Mass Save context.

---

Would you like me to write the data-joining script (in Python or JavaScript/TypeScript) to merge those three datasets right now, or draft the exact text to paste into the **[Submit your idea](https://hackachusetts2026.vercel.app/#/climate)** form?