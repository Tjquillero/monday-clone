import fs from "fs";
import path from "path";

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === "node_modules" || file === ".git" || file === ".next" || file === "dist" || file === "coverage") continue;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allFiles = walk(".");
const results = {
  uiRuntime: [],
  reportsPdf: [],
  svgWordmark: [],
  thirdParty: [],
  unvisitedComplex: []
};

// Regex for 800/900 weights and classes
const regexBlack = /\b(font-black|font-extrabold|font-\[800\]|font-\[900\])\b|font-weight\s*:\s*(800|900)\b|fontWeight\s*[:=]\s*["']?(800|900)["']?/i;

const complexSurfaces = [
  "EvidenceCurationModal",
  "GanttView",
  "MantenixMap",
  "PersonnelPicker",
  "ActividadesView",
  "DailyActivityExecutionModal",
  "LiveEvidenceGallery",
  "BoardEngine",
  "CalendarView",
  "AgendaView",
  "TacticalOperationsView",
  "PlannerBoardView",
  "WeeklyPlanner"
];

for (const f of allFiles) {
  const ext = path.extname(f);
  if (![".tsx", ".ts", ".jsx", ".js", ".css", ".html", ".svg"].includes(ext)) continue;
  if (f.includes("audit_weight_drift_step7.mjs")) continue;

  const content = fs.readFileSync(f, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    if (regexBlack.test(line)) {
      const match = line.match(regexBlack)[0];
      const normPath = f.replace(/\\/g, "/");
      const isSvg = normPath.endsWith(".svg") || normPath.includes("brand-assets") || line.includes("<svg") || line.includes("<path");
      const isReport = normPath.includes("report") || normPath.includes("pdf") || normPath.includes("acta") || normPath.includes("template") || normPath.includes("puppeteer");
      const isThirdParty = normPath.includes("recharts") || normPath.includes("leaflet") || normPath.includes("handsontable") || normPath.includes("hot-table");
      const isComplex = complexSurfaces.some(c => normPath.includes(c));

      const entry = {
        file: normPath,
        line: idx + 1,
        match: match,
        context: line.trim().substring(0, 120)
      };

      if (isSvg) {
        results.svgWordmark.push(entry);
      } else if (isReport) {
        results.reportsPdf.push(entry);
      } else if (isThirdParty) {
        results.thirdParty.push(entry);
      } else if (isComplex) {
        results.unvisitedComplex.push(entry);
      } else {
        results.uiRuntime.push(entry);
      }
    }
  });
}

console.log("=== INVENTARIO DE DRIFT DE PESOS (800/900) ===");
console.log("1. UI Runtime General:", results.uiRuntime.length);
console.log("2. Superficies Complejas / No Visitadas:", results.unvisitedComplex.length);
console.log("3. Reportes / PDF / Templates:", results.reportsPdf.length);
console.log("4. Terceros / Libs:", results.thirdParty.length);
console.log("5. SVG / Wordmark / Brand Assets:", results.svgWordmark.length);
console.log("Total General Hallazgos:",
  results.uiRuntime.length +
  results.unvisitedComplex.length +
  results.reportsPdf.length +
  results.thirdParty.length +
  results.svgWordmark.length
);

// Group by directory/component
const byFile = {};
[...results.uiRuntime, ...results.unvisitedComplex, ...results.reportsPdf, ...results.thirdParty, ...results.svgWordmark].forEach(e => {
  byFile[e.file] = (byFile[e.file] || 0) + 1;
});

console.log("\n=== TOP ARCHIVOS CON DRIFT ===");
Object.entries(byFile)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30)
  .forEach(([file, count]) => {
    console.log(`${count.toString().padStart(3, " ")} occ | ${file}`);
  });

// Save detailed JSON report
fs.writeFileSync("drift_step7_detailed.json", JSON.stringify(results, null, 2));
console.log("\nReporte detallado escrito en drift_step7_detailed.json");
