# Boston BERDO reporting, 2021

Saved 2026-10-18 for Hackachusetts.

2021 building energy disclosure. Street addresses are left out. The live call returns 100 rows as JSON. data.csv has a larger saved slice.

Rows in data.csv: 2472

Columns: Property_Type, Zip, Year_Built, Gross_Area_sf, Site_EUI_kBtuft2, ENERGY_STAR_Score, GHG_Emissions_MTCO2e, GHG_Intensity_kgCO2sf, per_Electricity, per_Gas

How to use it

- Spreadsheets: open data.csv in Excel or Google Sheets.
- Fresh copy: run `python fetch.py` or `node fetch.js`. Both call the URL below and save the response.
- The preview on the Hackachusetts site is a few rows of this same table.

Direct request

https://data.boston.gov/api/3/action/datastore_search?resource_id=43e4abc9-1fae-40d9-a02e-ff950bd0e732&fields=Property_Type,Zip,Year_Built,Gross_Area_sf,Site_EUI_kBtuft2,ENERGY_STAR_Score,GHG_Emissions_MTCO2e,GHG_Intensity_kgCO2sf,per_Electricity,per_Gas&limit=100

Check the source license before publishing a project.
