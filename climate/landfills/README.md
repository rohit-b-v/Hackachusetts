# Renewable projects at Massachusetts landfills

Saved 2026-10-18 for Hackachusetts.

MassDEP renewable projects on Massachusetts landfills. Street address is left out. Megawatts are the permitted and operating figures published by the state.

Rows in data.csv: 116

Columns: municipality, facility, type, mw_permitted, mw_operating, status, operating_since

How to use it

- Spreadsheets: open data.csv in Excel or Google Sheets.
- Fresh copy: run `python fetch.py` or `node fetch.js`. Both call the URL below and save the response.
- The preview on the Hackachusetts site is a few rows of this same table.

Direct request

https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/DEP/RenewablesAtMaLandfills/MapServer/0/query?where=1%3D1&outFields=MUNICIPALITY,FACILITY,TYPE_,MW_PERMITTED,MW_OPERATING,STATUS_1,OPERATING_SINCE&returnGeometry=false&f=json

Check the source license before publishing a project.
