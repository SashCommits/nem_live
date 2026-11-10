// Substation detail navigation should never require Ghost to serve
// an unregistered substation URL on browser reload.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const js = fs.readFileSync("qld-substations-widget.js", "utf8");
const from = js.indexOf("  function pageUrl(id) {");
const to = js.indexOf("\n  var css = ", from);
assert.ok(from >= 0 && to > from, "URL route helpers were not found");
const navFrom = js.indexOf("  function navigate(id) {", to);
const navTo = js.indexOf("\n  function createMarker", navFrom);
assert.ok(navFrom >= 0 && navTo > navFrom, "SPA navigation was not found");
const window = {
  location: new URL("https://news.example/headroom-explorer/?mode=dark"),
  history: {
    pushes: [],
    pushState(_state, _title, url) {
      this.pushes.push(url);
      window.location = new URL(url);
    }
  }
};
let rendered = 0, scrolled = 0;
const ctx = vm.createContext({
  window, URL, URLSearchParams,
  showCurrentRoute() { rendered++; },
  wrap: {scrollIntoView() {scrolled++; }}
});
vm.runInContext(js.slice(from, to) + "\n" + js.slice(navFrom, navTo), ctx);

function read(expression) { return vm.runInContext(expression, ctx); }
const link = read("pageUrl('ga:82')");
const parsed = new URL(link);
assert.equal(parsed.pathname, "/headroom-explorer/");
assert.equal(parsed.search, "?mode=dark");
assert.equal(parsed.hash, "#ps-substation=ga%3A82");
window.location = parsed;
assert.equal(read("routeSubstation()"), "ga:82", "Fragment survives a browser refresh");

window.location = new URL("https://news.example/headroom-explorer/?substation=ga%3A82");
assert.equal(read("routeSubstation()"), "ga:82", "Legacy query links remain accepted");

window.location = new URL("https://news.example/headroom-explorer/?mode=dark");
read("navigate('ga:894')");
assert.equal(window.location.pathname, "/headroom-explorer/");
assert.equal(read("routeSubstation()"), "ga:894");
assert.equal(window.history.pushes.length, 1);
assert.equal(rendered, 1);
assert.equal(scrolled, 1);
read("navigate(null)");
assert.equal(window.location.pathname, "/headroom-explorer/");
assert.equal(read("routeSubstation()"), null);
assert.equal(window.history.pushes.length, 2);
assert.equal(rendered, 2);

assert.ok(!js.includes("window.location.assign("), "Do not use full-page GET for a substation view");
assert.ok(js.includes('window.addEventListener("popstate", showCurrentRoute)'), "Browser Back/Forward must restore the viewed substation");
assert.ok(js.includes('window.addEventListener("hashchange", showCurrentRoute)'), "Manual fragment changes must restore the view");
assert.ok(js.includes("teardownMaps();"), "Abandoned map canvases must be cleaned up");
assert.ok(js.includes("back.onclick = function () { navigate(null); }"), "Back should switch views without reloading");
console.log("Substation refresh-safe URLs and in-page navigation passed");
