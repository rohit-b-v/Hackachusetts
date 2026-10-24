// Save a fresh copy of this Hackachusetts starter source.
// Run with: node fetch.js
const fs = require("node:fs/promises");

const url = "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query?geometry=-73.5081%2C41.1870%2C-69.9284%2C42.8868&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OWNER,VOLTAGE,VOLT_CLASS,TYPE,STATUS&returnGeometry=false&resultRecordCount=100&f=json";

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
