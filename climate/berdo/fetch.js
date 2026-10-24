// Save a fresh copy of this Hackachusetts starter source.
// Run with: node fetch.js
const fs = require("node:fs/promises");

const url = "https://data.boston.gov/api/3/action/datastore_search?resource_id=43e4abc9-1fae-40d9-a02e-ff950bd0e732&fields=Property_Type,Zip,Year_Built,Gross_Area_sf,Site_EUI_kBtuft2,ENERGY_STAR_Score,GHG_Emissions_MTCO2e,GHG_Intensity_kgCO2sf,per_Electricity,per_Gas&limit=100";

async function main() {
  const response = await fetch(url, { headers: { "User-Agent": "HackachusettsKit" } });
  if (!response.ok) throw new Error("Request failed: " + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type") || "";
  let name = "fresh.json";
  if (url.includes(".csv") || type.includes("csv")) name = "fresh.csv";
  if (url.endsWith(".txt")) name = "fresh.txt";
  await fs.writeFile(name, bytes);
  console.log("wrote " + name + " (" + bytes.length + " bytes)");
}

main();
