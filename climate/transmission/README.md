# Transmission lines crossing Massachusetts

Saved 2026-10-18 for Hackachusetts.

HIFLD electric transmission lines whose path intersects the Massachusetts bounding box. A line that crosses the state border can appear here. Geometry is omitted. The live call returns 100 features. data.csv has the full saved slice.

Rows in data.csv: 1228

Columns: owner, voltage_kv, volt_class, type, status

How to use it

- Spreadsheets: open data.csv in Excel or Google Sheets.
- Fresh copy: run `python fetch.py` or `node fetch.js`. Both call the URL below and save the response.
- The preview on the Hackachusetts site is a few rows of this same table.

Direct request

https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query?geometry=-73.5081%2C41.1870%2C-69.9284%2C42.8868&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OWNER,VOLTAGE,VOLT_CLASS,TYPE,STATUS&returnGeometry=false&resultRecordCount=100&f=json

Check the source license before publishing a project.
