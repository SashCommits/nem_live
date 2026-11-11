// Objective A: source-backed asset association must not imply electrical
// CP boundary, station-level MW or a fabricated GA pin.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const js = fs.readFileSync("qld-substations-widget.js", "utf8");
const from = js.indexOf("  function renderDocumentedConnections(block, site) {");
const to = js.indexOf("\n  function showDetail(site, meta) {", from);
assert.ok(from > 0 && to > from, "Documented assets renderer missing");

function element(tag, css, value) {
  return {
    tag, className: css || "", textContent: value || "",
    children: [], href: null, target: null, rel: null,
    appendChild(child) { this.children.push(child); return child; }
  };
}
const ctx = vm.createContext({
  el: element,
  toText(value, fallback) {
    return value === null || value === undefined || value === ""
      ? (fallback || "Not recorded") : String(value);
  },
  site: {
    id: "qld-diamondy",
    asset_association_note:
      "Project route confirmed; exact AEMO CP electrical boundary not verified",
    connected_assets: [
      {
        name: "Wambo Stage 1",
        duid: "WAMBOWF1",
        aemo_connection_point_id: "QDMW1W",
        relationship_type: "project_site_connection",
        relationship_summary: "Wambo connects via Diamondy",
        evidence_source_url: "https://www.powerlink.com.au/projects/wambo-wind-farm-connection-project",
      },
      {
        name: "Wambo Stage 2",
        duid: "WAMBOWF2",
        aemo_connection_point_id: "QDMR1W",
        relationship_type: "project_site_connection",
        relationship_summary: "Stage 2 extension of Diamondy",
        evidence_source_url: "https://www.powerlink.com.au/projects/wambo-wind-farm-connection-project",
      }
    ]
  },
  root: element("main")
});
vm.runInContext(js.slice(from, to), ctx);
vm.runInContext("renderDocumentedConnections(root, site)", ctx);
const panel = ctx.root.children[0];
assert.equal(panel.className, "ps-qs__connections");
const cardLabels = panel.children.filter(x => x.tag === "article");
assert.equal(cardLabels.length, 2);
assert.equal(cardLabels[0].children[0].textContent, "Wambo Stage 1");
assert.ok(cardLabels[0].children.some(x => x.textContent.includes("QDMW1W")));
assert.ok(cardLabels[1].children.some(x => x.textContent.includes("QDMR1W")));
assert.ok(cardLabels[0].children.some(x =>
  x.textContent.includes("precise electrical boundary remains unverified")));
const source = cardLabels[0].children.find(x => x.className === "ps-qs__connection-source");
assert.equal(source.children[0].href,
  "https://www.powerlink.com.au/projects/wambo-wind-farm-connection-project");
assert.equal(source.children[0].rel, "noopener noreferrer");
assert.ok(panel.children[1].textContent.includes("not verified"));

const empty = element("main");
ctx.empty = empty;
vm.runInContext("renderDocumentedConnections(empty, {id:'ga:999', name:'Unmapped'})", ctx);
assert.ok(empty.children[0].children[1].textContent.includes("does not mean no assets"));

assert.ok(js.includes("state.records = meta.sites.concat(meta.supplemental_sites || [], meta.unlocated_connection_sites || [])"),
  "Text-only Powerlink sites missing from searchable list");
assert.ok(js.includes("!site.no_map_marker && site.latitude != null && site.longitude != null"),
  "Unlocated source-only sites must never be rendered as map markers");
assert.ok(js.includes("if (smallMap)"), "Unlocated site must not attempt a detail map");
assert.ok(js.includes("if (!site.no_map_marker) renderMWChart(block, site)"),
  "Unlocated project sites must not present a fabricated MW chart");
assert.ok(js.includes('site.latitude == null ? "Unverified" : site.latitude.toFixed(6)'),
  "Unlocated site must avoid null latitude formatting errors");
assert.ok(!js.includes("innerHTML = site."), "Do not interpolate untrusted API text as HTML");

console.log("Documented asset cards, source links, CP caveats and unlocated profile safety passed");
