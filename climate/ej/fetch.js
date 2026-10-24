// Save a fresh copy of this Hackachusetts starter source.
// Run with: node fetch.js
const fs = require("node:fs/promises");

const url = "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/EJ2020/MapServer/0/query?where=EJ%3D%27Yes%27&outFields=MUNICIPALITY,TOTAL_POP,PCT_MINORITY,LIMENGHHPCT,BG_MHHI,EJ,EJ_CRIT_DESC&returnGeometry=false&resultRecordCount=100&f=json";

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
