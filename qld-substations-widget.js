// The Power Socket: Queensland substations from Geoscience Australia.
// Read-only geographic companion to the existing paid Headroom Explorer.
// Loaded by powersocket-grid-headroom /api/widget after headroom-widget.js.
// NO connection-point / DUID / generation link is assumed from geography.
(function () {
  "use strict";

  var source = document.querySelector("[data-headroom-explorer]");
  if (!source || document.querySelector("[data-qld-substations]")) return;
  var apiBase = (source.getAttribute("data-api") || "").replace(/\/$/, "");
  if (!apiBase) return;

  var COLORS = {
    operational: "#D63F47",
    construction: "#E8A13A",
    planned: "#4C87D9",
    nonoperational: "#707781",
    unverified: "#9299A5"
  };
  function lifecycle(status) {
    var s = String(status || "").toLowerCase().replace(/[-_]/g, " ").trim();
    if (s === "operational" || s === "operating" || s === "in operation") return "operational";
    if (s.indexOf("construction") >= 0 || s.indexOf("commissioning") >= 0) return "construction";
    if (s.indexOf("proposed") >= 0 || s.indexOf("planned") >= 0 || s === "approved") return "planned";
    if (s.indexOf("non operational") >= 0 || s.indexOf("decommissioned") >= 0 || s.indexOf("retired") >= 0) return "nonoperational";
    return "unverified";
  }
  function typeGroup(site) {
    return String(site.feature_subtype || "").toLowerCase().trim() === "zone" ? "zone" : "nonzone";
  }
  function toText(v, fallback) {
    return v === null || v === undefined || v === "" ? (fallback || "Not recorded") : String(v);
  }
  function el(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = textValue;
    return node;
  }
  function readDate(ms) {
    var n = Number(ms);
    if (!n || !Number.isFinite(n)) return "Not recorded";
    var d = new Date(n);
    return isNaN(d.getTime()) ? "Not recorded" : d.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
  }
  function pageUrl(id) {
    var u = new URL(window.location.href);
    u.searchParams.set("substation", id);
    u.hash = "";
    return u.toString();
  }
  function mapUrl() {
    var u = new URL(window.location.href);
    u.searchParams.delete("substation");
    u.hash = "";
    return u.toString();
  }

  var css = [
    ".ps-qs{font:inherit;color:inherit;margin:1rem 0 2.5rem;--qs-rule:rgba(109,111,112,.24);--qs-ink:inherit}",
    ".ps-qs *{box-sizing:border-box}",
    ".ps-qs h2,.ps-qs h3{font-family:inherit;letter-spacing:normal;margin:0}",
    ".ps-qs__head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap;border-bottom:1px solid var(--qs-rule);padding-bottom:1rem;margin-bottom:1rem}",
    ".ps-qs__head h2{font-size:clamp(1.3rem,2vw,2rem);font-weight:650}",
    ".ps-qs__intro{margin:.45rem 0 0;color:inherit;opacity:.8;font-size:.91rem;max-width:62rem}",
    ".ps-qs__source{font-size:.79rem;opacity:.77;margin-top:.65rem}",
    ".ps-qs__source a,.ps-qs__details a{color:inherit;text-decoration:underline;text-underline-offset:3px}",
    ".ps-qs__controls{display:flex;gap:.55rem;align-items:end;flex-wrap:wrap;margin-bottom:.7rem}",
    ".ps-qs__control{display:flex;flex-direction:column;gap:.28rem;min-width:9rem;font-size:.77rem}",
    ".ps-qs__control--search{flex:1;min-width:12rem}",
    ".ps-qs__control input,.ps-qs__control select{font:inherit;font-size:.9rem;padding:.6rem .65rem;border:1px solid var(--qs-rule);border-radius:5px;color:inherit;background:transparent;min-height:42px;width:100%}",
    ".ps-qs__control select option{color:#222;background:#fff}",
    ".ps-qs__legend{display:flex;align-items:center;flex-wrap:wrap;gap:.45rem 1rem;margin:.6rem 0 .85rem;font-size:.78rem}",
    ".ps-qs__legend-item{display:inline-flex;align-items:center;gap:.35rem}",
    ".ps-qs__swatch{width:.7rem;height:.7rem;border-radius:50%;display:inline-block}",
    ".ps-qs__map{height:min(64vh,600px);min-height:370px;border:1px solid var(--qs-rule);border-radius:5px;background:#e8ece9;overflow:hidden;position:relative}",
    ".ps-qs__map .leaflet-container{font-family:inherit}",
    ".ps-qs__map .leaflet-control-attribution{font-size:10px}",
    ".ps-qs__count{font-size:.83rem;opacity:.8;margin:.65rem 0}",
    ".ps-qs__results{max-height:15rem;overflow:auto;border-top:1px solid var(--qs-rule);display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}",
    ".ps-qs__item{font:inherit;cursor:pointer;text-align:left;color:inherit;border:0;border-bottom:1px solid var(--qs-rule);background:transparent;padding:.7rem .5rem;display:flex;gap:.45rem;align-items:center}",
    ".ps-qs__item:hover,.ps-qs__item:focus-visible{background:rgba(130,130,130,.1)}",
    ".ps-qs__item span:last-child{min-width:0}",
    ".ps-qs__item small{display:block;opacity:.65;font-size:.77rem}",
    ".ps-qs__details{max-width:970px;margin:0 auto}",
    ".ps-qs__back{background:transparent;border:1px solid var(--qs-rule);border-radius:4px;padding:.55rem .8rem;color:inherit;cursor:pointer;font:inherit;margin-bottom:1.3rem}",
    ".ps-qs__stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.65rem;margin:1rem 0 1.5rem}",
    ".ps-qs__stat{padding:1rem;border:1px solid var(--qs-rule);border-radius:5px}",
    ".ps-qs__stat strong{display:block;margin:.15rem 0;font-size:1.1rem}",
    ".ps-qs__stat small{opacity:.7}",
    ".ps-qs__detailmap{height:270px;border:1px solid var(--qs-rule);border-radius:5px;overflow:hidden;margin:1rem 0 1.6rem}",
    ".ps-qs__facts{display:grid;grid-template-columns:minmax(160px,230px) 1fr;gap:.55rem 1rem;border-top:1px solid var(--qs-rule);padding-top:1rem;font-size:.89rem;overflow-wrap:anywhere}",
    ".ps-qs__facts dt{opacity:.7}.ps-qs__facts dd{margin:0}",
    ".ps-qs__note{border-left:2px solid var(--qs-rule);padding:.8rem 1rem;margin:1.2rem 0;font-size:.86rem}",
    ".ps-qs__error{padding:1rem;border:1px solid var(--qs-rule)}",
    "@media(max-width:620px){.ps-qs__map{height:470px;min-height:300px}.ps-qs__facts{grid-template-columns:1fr}.ps-qs__facts dt{margin-top:.35rem}}"
  ].join("\n");
  if (!document.getElementById("ps-qld-substations-css")) {
    var style = el("style");
    style.id = "ps-qld-substations-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  var wrap = el("section", "ps-qs");
  wrap.setAttribute("data-qld-substations", "");
  wrap.setAttribute("aria-label", "Queensland substations");
  source.parentNode.insertBefore(wrap, source);

  var leafP;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafP) return leafP;
    leafP = new Promise(function (resolve, reject) {
      var link = el("link");
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
      var script = el("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = function () { resolve(window.L); };
      script.onerror = function () { reject(new Error("Couldn't load the map library")); };
      document.head.appendChild(script);
    });
    return leafP;
  }
  function addTiles(L, map) {
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
  }
  var state = { records: [], L: null, map: null, markers: null, mapPending: false };
  function fact(label, value, container) {
    container.appendChild(el("dt", "", label));
    container.appendChild(el("dd", "", value));
  }

  function showDetail(site, meta) {
    source.hidden = true;
    wrap.replaceChildren();
    var block = el("div", "ps-qs__details");
    wrap.appendChild(block);
    var back = el("button", "ps-qs__back", "← Back to Queensland map");
    back.type = "button";
    back.onclick = function () { window.location.assign(mapUrl()); };
    block.appendChild(back);
    var head = el("header", "ps-qs__head");
    var titlebox = el("div");
    titlebox.appendChild(el("h2", "", site.name));
    titlebox.appendChild(el("p", "ps-qs__intro", "Queensland substation · Geoscience Australia infrastructure record"));
    head.appendChild(titlebox);
    block.appendChild(head);

    var stats = el("div", "ps-qs__stats");
    [
      ["Status (GA)", toText(site.status)],
      ["Voltage (GA)", site.voltage_kv == null ? "Not recorded" : site.voltage_kv + " kV"],
      ["Type", toText(site.feature_subtype, toText(site.feature_type))],
      ["Locality", toText(site.locality)]
    ].forEach(function (pair) {
      var cell = el("div", "ps-qs__stat");
      cell.appendChild(el("small", "", pair[0]));
      cell.appendChild(el("strong", "", pair[1]));
      stats.appendChild(cell);
    });
    block.appendChild(stats);

    var smallMap = el("div", "ps-qs__detailmap");
    smallMap.setAttribute("aria-label", "Substation geographic location");
    block.appendChild(smallMap);
    var facts = el("dl", "ps-qs__facts");
    fact("GA record ID", toText(site.ga_objectid), facts);
    fact("Latitude", site.latitude.toFixed(6), facts);
    fact("Longitude", site.longitude.toFixed(6), facts);
    fact("Feature category", toText(site.feature_type), facts);
    fact("Feature subtype", toText(site.feature_subtype), facts);
    fact("Description", toText(site.description), facts);
    fact("Location confidence (GA)", toText(site.spatial_confidence), facts);
    fact("GA feature source", toText(site.feature_source), facts);
    fact("Last edited (GA)", readDate(site.last_edited_on), facts);
    block.appendChild(facts);

    var notice = el("p", "ps-qs__note", "Substation locations and statuses are displayed as provided by Geoscience Australia. Some features are distribution substations. A GA feature is not proof of Powerlink ownership. Headroom calculations have not yet been assigned to physical substation records.");
    block.appendChild(notice);
    var sourceP = el("p", "ps-qs__source");
    var sourceLink = el("a", "", "Source: Geoscience Australia, Electricity Infrastructure (CC BY 4.0)");
    sourceLink.href = meta.source_url;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    sourceP.appendChild(sourceLink);
    block.appendChild(sourceP);
    loadLeaflet().then(function (L) {
      var map = L.map(smallMap, { scrollWheelZoom: false }).setView([site.latitude, site.longitude], 12);
      addTiles(L, map);
      L.circleMarker([site.latitude, site.longitude], {
        radius: 9, color: "#fff", weight: 2,
        fillColor: COLORS[lifecycle(site.status)], fillOpacity: .95
      }).addTo(map);
      setTimeout(function () { map.invalidateSize(); }, 0);
    }).catch(function () { smallMap.textContent = "Map tiles could not be loaded. Coordinates are listed below."; });
  }

  function showMap(meta) {
    source.hidden = false;
    wrap.replaceChildren();
    var head = el("div", "ps-qs__head");
    var titlebox = el("div");
    titlebox.appendChild(el("h2", "", "Queensland substations"));
    titlebox.appendChild(el("p", "ps-qs__intro", "Explore the locations recorded in Geoscience Australia's electricity infrastructure dataset. Hover for basic information; select a substation for its technical details."));
    head.appendChild(titlebox);
    wrap.appendChild(head);

    var controls = el("div", "ps-qs__controls");
    wrap.appendChild(controls);
    function control(label, className) {
      var node = el("label", "ps-qs__control " + (className || ""));
      node.appendChild(el("span", "", label));
      controls.appendChild(node);
      return node;
    }
    var search = el("input");
    search.type = "search"; search.placeholder = "Search a substation or locality";
    search.setAttribute("aria-label", "Search Queensland substations");
    control("Find a substation", "ps-qs__control--search").appendChild(search);
    var coverage = el("select");
    [["all", "All GA substations"], ["nonzone", "Non-zone"], ["zone", "Zone / distribution"]].forEach(function (o) {
      var opt = el("option", "", o[1]); opt.value = o[0]; coverage.appendChild(opt);
    });
    control("Substation category").appendChild(coverage);
    var status = el("select");
    [
      ["all", "All statuses"], ["operational", "Operational"],
      ["construction", "Under construction"], ["planned", "Planned"],
      ["nonoperational", "Non-operational"], ["unverified", "Status unknown"]
    ].forEach(function (o) { var opt = el("option", "", o[1]); opt.value = o[0]; status.appendChild(opt); });
    control("Operating status").appendChild(status);
    var voltage = el("select");
    var all = el("option", "", "All voltages"); all.value = "all"; voltage.appendChild(all);
    var vals = Array.from(new Set(state.records.map(function (s) { return s.voltage_kv; })
      .filter(function (v) { return v != null; }))).sort(function (a,b) { return b - a; });
    vals.forEach(function (v) { var o = el("option", "", v + " kV"); o.value = String(v); voltage.appendChild(o); });
    control("Recorded voltage").appendChild(voltage);

    var legend = el("div", "ps-qs__legend");
    [
      ["operational", "Operational"], ["construction", "Under construction / commissioning"],
      ["planned", "Planned"], ["nonoperational", "Non-operational"], ["unverified", "Unknown"]
    ].forEach(function (item) {
      var node = el("span", "ps-qs__legend-item");
      var swatch = el("i", "ps-qs__swatch");
      swatch.style.background = COLORS[item[0]];
      node.appendChild(swatch);
      node.appendChild(el("span", "", item[1]));
      legend.appendChild(node);
    });
    wrap.appendChild(legend);

    var mapNode = el("div", "ps-qs__map");
    mapNode.setAttribute("role", "region");
    mapNode.setAttribute("aria-label", "Queensland substation map");
    wrap.appendChild(mapNode);
    var count = el("p", "ps-qs__count", "Loading map…");
    wrap.appendChild(count);
    var results = el("div", "ps-qs__results");
    results.setAttribute("aria-label", "List of displayed substations");
    wrap.appendChild(results);
    var sourceP = el("p", "ps-qs__source");
    var sourceLink = el("a", "", "Data: Geoscience Australia (2026), CC BY 4.0");
    sourceLink.href = meta.source_url;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    sourceP.appendChild(sourceLink);
    sourceP.appendChild(document.createTextNode(" · Records are shown as published; duplicate names are not merged. Non-zone does not establish Powerlink ownership."));
    wrap.appendChild(sourceP);

    function filtered() {
      var q = search.value.toLocaleLowerCase().trim();
      return state.records.filter(function (s) {
        if (coverage.value !== "all" && typeGroup(s) !== coverage.value) return false;
        if (status.value !== "all" && lifecycle(s.status) !== status.value) return false;
        if (voltage.value !== "all" && String(s.voltage_kv) !== voltage.value) return false;
        return !q || (String(s.name) + " " + String(s.locality || "")).toLocaleLowerCase().indexOf(q) >= 0;
      });
    }
    function render() {
      var records = filtered();
      count.textContent = records.length + " of " + state.records.length + " GA Queensland substation records shown";
      results.replaceChildren();
      records.slice().sort(function (a,b) {
        return String(a.name).localeCompare(String(b.name)) || Number(a.ga_objectid) - Number(b.ga_objectid);
      }).slice(0, 80).forEach(function (s) {
        var button = el("button", "ps-qs__item");
        button.type = "button";
        var sw = el("i", "ps-qs__swatch"); sw.style.background = COLORS[lifecycle(s.status)];
        button.appendChild(sw);
        var t = el("span");
        t.appendChild(el("span", "", s.name));
        t.appendChild(el("small", "", toText(s.locality) + " · " + toText(s.voltage_kv, "Unknown") + " kV · GA #" + s.ga_objectid));
        button.appendChild(t);
        button.onclick = function () { window.location.assign(pageUrl(s.id)); };
        results.appendChild(button);
      });
      if (records.length > 80) results.appendChild(el("p", "ps-qs__count", "Showing the first 80 names. Search or filter to narrow results."));
      if (state.map && state.markers) {
        state.markers.clearLayers();
        records.forEach(function (s) {
          var marker = state.L.circleMarker([s.latitude,s.longitude], {
            radius: 6, color: "#fff", weight: 1.6,
            fillColor: COLORS[lifecycle(s.status)], fillOpacity: .95
          }).addTo(state.markers);
          var tip = el("div");
          tip.appendChild(el("strong", "", s.name));
          tip.appendChild(el("div", "", "Voltage: " + toText(s.voltage_kv, "Unknown") + " kV"));
          tip.appendChild(el("div", "", "Status: " + toText(s.status)));
          tip.appendChild(el("div", "", "GA feature #" + s.ga_objectid));
          marker.bindTooltip(tip, { direction: "top", opacity: .97 });
          marker.on("click", function () { window.location.assign(pageUrl(s.id)); });
        });
      }
    }
    [search, coverage, status, voltage].forEach(function (node) {
      node.addEventListener(node === search ? "input" : "change", render);
    });

    loadLeaflet().then(function (L) {
      state.L = L;
      state.map = L.map(mapNode, { scrollWheelZoom:false, zoomSnap:.25 }).setView([-21.3,145.5],5.25);
      addTiles(L, state.map);
      state.markers = L.layerGroup().addTo(state.map);
      render();
      setTimeout(function () { state.map.invalidateSize(); }, 0);
    }).catch(function () {
      mapNode.textContent = "Map tiles could not be loaded. The searchable substation list remains available below.";
      render();
    });
    render();
  }

  var activeID = new URLSearchParams(window.location.search).get("substation");
  var loading = el("p", "ps-qs__intro", "Loading Queensland substation records from Geoscience Australia…");
  wrap.appendChild(loading);
  fetch(apiBase + "/api/substations", { cache: "default" })
    .then(function (response) { if (!response.ok) throw Error("GIS source unavailable"); return response.json(); })
    .then(function (meta) {
      if (!meta || !Array.isArray(meta.sites)) throw Error("Invalid substation response");
      state.records = meta.sites;
      var site = state.records.find(function (r) { return r.id === activeID; });
      if (activeID && !site) {
        wrap.replaceChildren();
        var missing = el("div", "ps-qs__error");
        missing.appendChild(el("h3", "", "Substation record not found"));
        var home = el("a", "", "Return to Queensland map");
        home.href = mapUrl();
        missing.appendChild(home);
        wrap.appendChild(missing);
        source.hidden = true;
        return;
      }
      if (site) showDetail(site, meta);
      else showMap(meta);
    })
    .catch(function () {
      wrap.replaceChildren();
      var failed = el("p", "ps-qs__error", "Queensland substation locations are temporarily unavailable. The existing Headroom Explorer remains accessible below.");
      wrap.appendChild(failed);
      source.hidden = false;
    });
})();
