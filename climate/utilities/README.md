# Electric utility by Massachusetts town

Saved 2026-10-18 for Hackachusetts.

The electric distribution utility for each of the 351 Massachusetts towns, from MassGIS. Geometry is omitted.

Rows in data.csv: 351

Columns: town, utility_code, utility

How to use it

- Spreadsheets: open data.csv in Excel or Google Sheets.
- Fresh copy: run `python fetch.py` or `node fetch.js`. Both call the URL below and save the response.
- The preview on the Hackachusetts site is a few rows of this same table.

Direct request

https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0/query?where=1%3D1&outFields=TOWN,ELEC,ELEC_LABEL&returnGeometry=false&f=json

Check the source license before publishing a project.
