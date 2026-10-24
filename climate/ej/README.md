# MassGIS environmental justice block groups

Saved 2026-10-18 for Hackachusetts.

The live call returns 100 block groups flagged Yes. data.csv has a larger saved extract of the same layer.

Rows in data.csv: 2604

Columns: municipality, population, minority_pct, limited_english_hh_pct, block_group_income, ej, criteria

How to use it

- Spreadsheets: open data.csv in Excel or Google Sheets.
- Fresh copy: run `python fetch.py` or `node fetch.js`. Both call the URL below and save the response.
- The preview on the Hackachusetts site is a few rows of this same table.

Direct request

https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/EJ2020/MapServer/0/query?where=EJ%3D%27Yes%27&outFields=MUNICIPALITY,TOTAL_POP,PCT_MINORITY,LIMENGHHPCT,BG_MHHI,EJ,EJ_CRIT_DESC&returnGeometry=false&resultRecordCount=100&f=json

Check the source license before publishing a project.
