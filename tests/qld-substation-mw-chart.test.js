// Regression: every substation detail shows a chart canvas even if no
// verified AEMO connection-point mapping exists, or if member sign-in fails.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.handlers = {};
    this.textContent = "";
    this.value = "";
    this.style = {};
    this.isConnected = true;
    this.classList = {add: () => {}};
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(key, fn) { this.handlers[key] = fn; }
  remove() { this.isConnected = false; }
  get lastChild() {return this.children[this.children.length-1];}
}
const elements = [];
const el = (tag, cls, text) => {
  const e=new Element(tag); e.className=cls;
  if(text!==undefined)e.textContent=text;
  elements.push(e); return e;
};
const svgEl = (tag) => new Element(tag);
const source = fs.readFileSync("qld-substations-widget.js","utf8");
const start=source.indexOf("  function renderMWChart(container, site) {");
const end=source.indexOf("  function showDetail(site, meta) {", start);
assert(start>=0 && end>start, "Render function not found");
assert(source.includes("renderMWChart(block, site)"),"Detail page must include the MW chart");
assert(source.includes("No verified MW series available"),"Visible missing-data chart required");

async function exercise(backend, siteID='ga:82') {
  const requests=[];
  const ctx={
    document:{createElementNS: (_ns,tag) => svgEl(tag)},
    el,
    apiBase:"https://api.example",
    window:{location:{origin:"https://news.example"}},
    fetch(url) {
      requests.push(url);
      if(url.includes("/members/api/session"))return Promise.resolve({ok:true,text:()=>Promise.resolve("test-session")});
      return Promise.resolve({ok:true,json:()=>Promise.resolve(backend)});
    }
  };
  vm.runInNewContext(source.slice(start,end),ctx);
  const container = new Element("div");
  const site={id:siteID,name:siteID==="qld-diamondy"?"Diamondy":"Example station"};
  vm.runInNewContext("renderMWChart(container, site)",Object.assign(ctx,{container,site}));
  const panel=container.children[0];
  assert(panel && panel.className==="ps-qs__mw","MW chart section must exist");
  const chart=panel.children.find(e=>e.className==="ps-qs__mw-chart");
  const state=panel.children.find(e=>e.className==="ps-qs__mw-message");
  assert(chart && chart.children[0]?.tagName==="svg","Chart axes should render before the network request");
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  return {requests,panel,chart,state};
}

(async ()=>{
  const unmapped=await exercise({
    site_id:"ga:82",status:"unmapped",
    reason:"No verified GA-to-AEMO link for this physical substation."
  });
  assert(unmapped.requests.some(url=>url.includes("site_id=ga%3A82")));
  assert.equal(unmapped.chart.attributes["data-series-state"],"unavailable");
  assert.equal(unmapped.chart.children[0].tagName,"svg");
  assert(unmapped.state.textContent.includes("No verified GA-to-AEMO"));

  const available=await exercise({
    site_id:"ga:82",status:"available",
    connection_point_label:"Verified AEMO test point",
    start:"2026-10-01",end:"2026-10-02",
    timestamps_aest:["2026-10-01T10:00","2026-10-01T11:00","2026-10-01T12:00"],
    modelled_ceiling_mw:[200,210,190],
    observed_injection_mw:[130,150,140],
    assets:[]
  });
  assert.equal(available.chart.attributes["data-series-state"],"available");
  const svg=available.chart.children.find(c=>c.tagName==="svg");
  assert(svg && svg.children.some(c=>c.tagName==="path"),"Verified data must draw real MW lines");
  // The Diamondy pilot plots two separately sourced Wambo unit traces.
  const diamondy=await exercise({
    site_id:"qld-diamondy",status:"available",
    start:"2026-10-01",end:"2026-10-31",
    timestamps_aest:["2026-10-01T10:00","2026-10-01T11:00","2026-10-01T12:00"],
    modelled_ceiling_mw:[null,null,null],
    observed_injection_mw:[180,190,200],
    assets:[
      {name:"Wambo Stage 1",duid:"WAMBOWF1",mw:[100,110,120],dispatch_target_mw:[98,108,117]},
      {name:"Wambo Stage 2",duid:"WAMBOWF2",mw:[80,80,80],dispatch_target_mw:[79,82,78]}
    ],
    connection_point_models:[
      {connection_point_id:"QDMW1W",status:"available",modelled_ceiling_mw:[200,210,220]},
      {connection_point_id:"QDMR1W",status:"not_invoked",modelled_ceiling_mw:[null,null,null]}
    ]
  },"qld-diamondy");
  assert(diamondy.requests.some(url=>url.includes("site_id=qld-diamondy")));
  assert.equal(diamondy.chart.attributes["data-series-state"],"available");
  const diamondySvg=diamondy.chart.children.find(c=>c.tagName==="svg");
  const paths=diamondySvg.children.filter(c=>c.tagName==="path");
  assert.equal(paths.length,4,"Reported total, two Wambo DUIDs and a separate modelled CP curve expected");
  assert(paths.some(p=>p.attributes["stroke-dasharray"]==="7 5"),
    "AEMO connection-point ceiling must be dashed and distinct");
  assert(diamondy.state.textContent.includes("Wambo units"));
  console.log("MW chart visibility, Wambo per-unit SCADA and scoped headroom drawing passed");
})().catch(error=>{console.error(error);process.exitCode=1});
