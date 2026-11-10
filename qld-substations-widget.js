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
  // Ghost serves one real page at /headroom-explorer/. Individual GA
  // substations are client-side views of that page, not separate Ghost pages.
  // Store their IDs in a URL fragment so refresh never requires a second
  // Ghost route or a query-string redirect.
  function pageUrl(id) {
    var u = new URL(window.location.href);
    u.searchParams.delete("substation"); // legacy links remain readable
    u.hash = "ps-substation=" + encodeURIComponent(id);
    return u.toString();
  }
  function mapUrl() {
    var u = new URL(window.location.href);
    u.searchParams.delete("substation");
    if (u.hash.indexOf("#ps-substation=") === 0) u.hash = "";
    return u.toString();
  }
  function routeSubstation() {
    var hash = window.location.hash || "";
    if (hash.indexOf("#ps-substation=") === 0) {
      return new URLSearchParams(hash.slice(1)).get("ps-substation");
    }
    return new URLSearchParams(window.location.search).get("substation");
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
    ".ps-qs__map .maplibregl-map{font-family:inherit}",
    ".ps-qs__map .maplibregl-ctrl-attrib{font-size:10px}",
    ".ps-qs__map .maplibregl-popup-content{color:#222;font-size:.84rem;line-height:1.45}",
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

    ".ps-qs__mw{margin:1.2rem 0 1.55rem;border:1px solid var(--qs-rule);padding:1rem;border-radius:5px}",
    ".ps-qs__mw-head{display:flex;align-items:center;justify-content:space-between;gap:.7rem;flex-wrap:wrap}",
    ".ps-qs__mw-head h3{font-size:1.12rem;font-weight:650}",
    ".ps-qs__mw-period{color:inherit;background:transparent;border:1px solid var(--qs-rule);font:inherit;font-size:.82rem;padding:.45rem;border-radius:4px}",
    ".ps-qs__mw-description,.ps-qs__mw-footnote{font-size:.82rem;opacity:.77;margin:.65rem 0}",
    ".ps-qs__mw-legend{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;margin:.8rem 0;font-size:.8rem}",
    ".ps-qs__mw-label{display:inline-flex;align-items:center;gap:.35rem}",
    ".ps-qs__mw-swatch{width:1.25rem;height:3px;display:inline-block;border-radius:2px}",
    ".ps-qs__mw-message,.ps-qs__mw-assets{font-size:.86rem;margin:.7rem 0}",
    ".ps-qs__mw-chart{overflow:hidden;position:relative;min-height:235px}",
    ".ps-qs__mw-empty-svg{width:100%;height:auto;display:block;min-height:235px;border:1px solid var(--qs-rule);border-radius:3px}",

    ".ps-qs__mw-hover{font-size:.75rem;opacity:.8;min-height:1rem;padding:.3rem 0}",
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

  // Shared site basemap. Any map added elsewhere should use the same module.
  // The page and its /api/widget response are cached independently.
  // During a deploy, an older widget bundle can contain this Queensland
  // component without the newly introduced shared map core. Self-load the
  // version-pinned module instead of permanently showing an error.
  var MAP_CORE_FALLBACK = "https://cdn.jsdelivr.net/gh/SashCommits/nem_live@a3fef15e5b96d77f24c2cfa598fa5f8d2ad5080c/powersocket-map-core.js";
  function ensureMapCore() {
    if (window.PowerSocketMaps) return Promise.resolve(window.PowerSocketMaps);
    if (window.__psSharedMapCorePromise) return window.__psSharedMapCorePromise;
    window.__psSharedMapCorePromise = new Promise(function (resolve, reject) {
      var script = el("script");
      script.src = MAP_CORE_FALLBACK;
      script.async = true;
      script.onload = function () {
        if (window.PowerSocketMaps) resolve(window.PowerSocketMaps);
        else reject(new Error("Shared map module did not initialise"));
      };
      script.onerror = function () { reject(new Error("Shared map module could not be loaded")); };
      document.head.appendChild(script);
    }).catch(function (error) {
      window.__psSharedMapCorePromise = null;
      throw error;
    });
    return window.__psSharedMapCorePromise;
  }
  function startQueenslandMap(maps) {
  var state = { records: [], map: null, detailMap: null, lib: null, markers: [], mapPending: false };
  var loadedMeta = null, currentViewId;
  function teardownMaps() {
    // Remove detached map canvases when changing views repeatedly.
    if (state.map) { state.map.remove(); state.map = null; }
    if (state.detailMap) { state.detailMap.remove(); state.detailMap = null; }
    state.lib = null;
    state.markers = [];
  }
  function showCurrentRoute() {
    if (!loadedMeta) return;
    var id = routeSubstation();
    if (id === currentViewId) return;
    currentViewId = id;
    teardownMaps();
    if (!id) { showMap(loadedMeta); return; }
    var site = state.records.find(function (item) { return item.id === id; });
    if (!site) {
      source.hidden = true;
      wrap.replaceChildren();
      var missing = el("div", "ps-qs__error");
      missing.appendChild(el("h3", "", "Substation record not found"));
      var home = el("a", "", "Return to Queensland map");
      home.href = mapUrl();
      home.onclick = function (event) { event.preventDefault(); navigate(null); };
      missing.appendChild(home);
      wrap.appendChild(missing);
      return;
    }
    showDetail(site, loadedMeta);
  }
  function navigate(id) {
    var target = id ? pageUrl(id) : mapUrl();
    // No full-page request: Ghost keeps serving the same page. Browser
    // Back, Forward and copied deep links still work.
    window.history.pushState({ psSubstation: id || null }, "", target);
    showCurrentRoute();
    wrap.scrollIntoView({ block: "start" });
  }
  function createMarker(site, map, lib, size, allowNavigation) {
    var point = maps.marker(lib, site.latitude, site.longitude,
      COLORS[lifecycle(site.status)], size);
    point.marker.addTo(map);
    var element = point.element;
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", site.name + " — " +
      toText(site.voltage_kv) + " kV, " + toText(site.status));
    var popup;
    function showPopup() {
      if (popup) return;
      var content = el("div");
      content.appendChild(el("strong", "", site.name));
      content.appendChild(el("div", "", "Voltage: " + toText(site.voltage_kv) + " kV"));
      content.appendChild(el("div", "", "Status: " + toText(site.status)));
      content.appendChild(el("div", "", "GA feature #" + site.ga_objectid));
      popup = new lib.Popup({ closeButton: false, closeOnClick: false, offset: 11 })
        .setLngLat([site.longitude, site.latitude]).setDOMContent(content).addTo(map);
    }
    function hidePopup() { if (popup) { popup.remove(); popup = null; } }
    element.addEventListener("mouseenter", showPopup);
    element.addEventListener("mouseleave", hidePopup);
    element.addEventListener("focus", showPopup);
    element.addEventListener("blur", hidePopup);
    element.addEventListener("click", function () {
      if (allowNavigation) navigate(site.id);
    });
    element.addEventListener("keydown", function (event) {
      if ((event.key === "Enter" || event.key === " ") && allowNavigation) {
        event.preventDefault();
        navigate(site.id);
      }
    });
    return {
      remove: function () { hidePopup(); point.marker.remove(); }
    };
  }

  function fact(label, value, container) {
    container.appendChild(el("dt", "", label));
    container.appendChild(el("dd", "", value));
  }


  // Physical GA sites and AEMO dispatch connection points are not 1:1.
  // This chart intentionally refuses to attribute time series until the
  // backend has an independently evidence-verified physical site mapping.
  function renderMWChart(container, site) {
    var panel = el("section", "ps-qs__mw");
    panel.setAttribute("aria-label", "Substation network capacity and generation over time");
    container.appendChild(panel);
    var hdr = el("div", "ps-qs__mw-head");
    hdr.appendChild(el("h3", "", "Network capacity and generation over time"));
    var period = el("select", "ps-qs__mw-period");
    period.setAttribute("aria-label", "MW chart period");
    [["5m","Latest day · 5-minute"], ["1h","Latest 31 days · hourly"],
      ["1d","Latest year · daily"]].forEach(function (pair) {
      var opt = el("option", "", pair[1]);
      opt.value = pair[0];
      if (pair[0] === "1h") opt.selected = true;
      period.appendChild(opt);
    });
    hdr.appendChild(period);
    panel.appendChild(hdr);
    panel.appendChild(el("p", "ps-qs__mw-description",
      "Network injection ceiling (modelled), actual net injection and the contributions of individual connected assets — in MW over time."));
    var legend = el("div", "ps-qs__mw-legend");
    [["#D63F47","Modelled network injection ceiling"], ["#48AC57","Actual net injection"]]
      .forEach(function (pair) {
        var item = el("span","ps-qs__mw-label");
        var swatch = el("i","ps-qs__mw-swatch");
        swatch.style.background = pair[0]; item.appendChild(swatch);
        item.appendChild(el("span","",pair[1])); legend.appendChild(item);
      });
    panel.appendChild(legend);
    var status = el("p", "ps-qs__mw-message");
    status.setAttribute("role","status");
    panel.appendChild(status);
    var chartBox = el("div", "ps-qs__mw-chart");
    panel.appendChild(chartBox);
    var assets = el("div", "ps-qs__mw-assets");
    panel.appendChild(assets);
    panel.appendChild(el("p", "ps-qs__mw-footnote",
      "The red curve is a modelled, time-varying connection-point injection ceiling — not an approved export limit or permanent substation rating. Green is net injection (negative values mean withdrawal). Missing data where no network limit was invoked must not be interpreted as zero headroom. NEM time (AEST)."));
    var colors = ["#235D97","#9160C1","#DC9828","#39867E","#A66B4C","#7D8D37"];
    var busy = 0;

    // Always reserve an actual chart canvas. A data-integrity gate must not
    // turn the promised MW graph into invisible whitespace.
    // No measurement lines or numerical tick labels are invented here.
    function drawEmptyChart(reason) {
      chartBox.replaceChildren();
      var ns="http://www.w3.org/2000/svg";
      var width=900, height=340, left=65, right=22, top=22, bottom=52;
      var svg=document.createElementNS(ns,"svg");
      svg.setAttribute("viewBox","0 0 "+width+" "+height);
      svg.setAttribute("role","img");
      svg.setAttribute("aria-label","MW over time chart, no verified measurements available");
      svg.classList.add("ps-qs__mw-empty-svg");
      function svgEl(tag, attrs, value) {
        var element=document.createElementNS(ns,tag);
        Object.keys(attrs||{}).forEach(function(key){element.setAttribute(key,String(attrs[key]));});
        if(value!==undefined)element.textContent=value;
        svg.appendChild(element);
        return element;
      }
      for(var row=0;row<=4;row++){
        var y=top+(height-top-bottom)*row/4;
        svgEl("line",{x1:left,y1:y,x2:width-right,y2:y,stroke:"currentColor","stroke-opacity":".14"});
      }
      svgEl("line",{x1:left,y1:top,x2:left,y2:height-bottom,stroke:"currentColor","stroke-opacity":".5"});
      svgEl("line",{x1:left,y1:height-bottom,x2:width-right,y2:height-bottom,stroke:"currentColor","stroke-opacity":".5"});
      svgEl("text",{x:left-30,y:top+7,"font-size":"15","font-weight":"600",fill:"currentColor"},"MW");
      svgEl("text",{x:(left+width-right)/2,y:height-15,"text-anchor":"middle","font-size":"14",fill:"currentColor"},"Time (AEST)");
      svgEl("text",{x:width/2,y:height/2-8,"text-anchor":"middle",
        "font-size":"20","font-weight":"600",fill:"currentColor"},"No verified MW series available");
      svgEl("text",{x:width/2,y:height/2+20,"text-anchor":"middle",
        "font-size":"13",fill:"currentColor","fill-opacity":".75"},"Chart lines will appear only when linked to real measurements");
      chartBox.appendChild(svg);
      chartBox.setAttribute("data-series-state","unavailable");
      if(reason) status.textContent=reason;
    }

    function chartSvg(response) {
      chartBox.replaceChildren();
      chartBox.setAttribute("data-series-state","available");
      var t = response.timestamps_aest || [];
      var lines = [
        {name:"Modelled injection ceiling", color:"#D63F47", v:response.modelled_ceiling_mw},
        {name:"Actual net injection", color:"#48AC57", v:response.observed_injection_mw}
      ];
      (response.assets || []).forEach(function (a, idx) {
        if (Array.isArray(a.mw) && a.mw.length === t.length) {
          lines.push({name:a.name || a.duid || ("Asset " + (idx+1)),
            color:colors[idx % colors.length], v:a.mw});
          var item=el("span","ps-qs__mw-label");
          var sw=el("i","ps-qs__mw-swatch"); sw.style.background=colors[idx % colors.length];
          item.appendChild(sw); item.appendChild(el("span","",lines[lines.length-1].name));
          legend.appendChild(item);
        }
      });
      var values = [];
      lines.forEach(function (line) {
        if (!Array.isArray(line.v) || line.v.length !== t.length) return;
        line.v.forEach(function (x) { if (typeof x === "number" && Number.isFinite(x)) values.push(x); });
      });
      if (t.length < 2 || !values.length) {
        drawEmptyChart("No modelled network constraint was invoked in this time window; this is not evidence of zero or unlimited capacity.");
        return;
      }
      var width = 900, height = 342, left = 61, top = 19, right = 18, bottom = 49;
      var innerW = width-left-right, innerH = height-top-bottom;
      var low = Math.min(0,...values), high = Math.max(0,...values);
      if (high === low) high = low + 1;
      var pad = (high-low)*.08;
      low -= pad; high += pad;
      var x = function(i){return left+(t.length===1?innerW/2:(i/(t.length-1))*innerW);};
      var y = function(v){return top+(high-v)/(high-low)*innerH;};
      var ns="http://www.w3.org/2000/svg";
      var svg=document.createElementNS(ns,"svg");
      svg.setAttribute("viewBox","0 0 "+width+" "+height);
      svg.setAttribute("role","img");
      svg.setAttribute("aria-label","MW over time: modelled injection ceiling, actual net injection, and verified individual assets");
      svg.style.cssText="width:100%;height:auto;display:block;min-height:235px";
      function sv(tag, attrs, textValue) {
        var e=document.createElementNS(ns,tag);
        Object.keys(attrs||{}).forEach(function(k){e.setAttribute(k,String(attrs[k]));});
        if(textValue!==undefined)e.textContent=textValue;
        svg.appendChild(e); return e;
      }
      for(var k=0;k<=4;k++){
        var v=low+(high-low)*k/4, gy=y(v);
        sv("line",{x1:left,y1:gy,x2:width-right,y2:gy,stroke:"currentColor","stroke-opacity":".13"});
        sv("text",{x:left-9,y:gy+4,"text-anchor":"end",fill:"currentColor","font-size":"12"},Math.round(v).toLocaleString());
      }
      sv("text",{x:14,y:16,fill:"currentColor","font-size":"13","font-weight":"600"},"MW");
      sv("line",{x1:left,y1:height-bottom,x2:width-right,y2:height-bottom,stroke:"currentColor","stroke-opacity":".5"});
      for(var tick=0;tick<=4;tick++){
        var ix=Math.min(t.length-1,Math.round((t.length-1)*tick/4));
        sv("text",{x:x(ix),y:height-bottom+23,"text-anchor":"middle",fill:"currentColor","font-size":"12"},
          String(t[ix]).replace("T"," ").slice(5,16));
      }
      var anyDrawn=false;
      lines.forEach(function(line) {
        if(!Array.isArray(line.v)||line.v.length!==t.length)return;
        var path="",active=false;
        line.v.forEach(function(val,i) {
          if(typeof val !== "number" || !Number.isFinite(val)){active=false;return;}
          path += (active?"L":"M")+x(i).toFixed(2)+","+y(val).toFixed(2);
          active=true;
        });
        if(path){ sv("path",{d:path,fill:"none",stroke:line.color,
          "stroke-width":line===lines[0]?2.9:2.25,
          "stroke-linecap":"round","stroke-linejoin":"round"}); anyDrawn=true; }
      });
      if(!anyDrawn) return;
      var guide=sv("line",{x1:left,y1:top,x2:left,y2:height-bottom,stroke:"currentColor",
        "stroke-opacity":".3","stroke-dasharray":"4 4",visibility:"hidden"});
      var label=el("div","ps-qs__mw-hover");
      label.setAttribute("aria-live","off");
      chartBox.appendChild(svg); chartBox.appendChild(label);
      svg.addEventListener("pointermove",function(ev){
        var b=svg.getBoundingClientRect();
        var frac=(ev.clientX-b.left)/Math.max(1,b.width);
        var i=Math.min(t.length-1,Math.max(0,Math.round((frac*width-left)/innerW*(t.length-1))));
        guide.setAttribute("x1",x(i));guide.setAttribute("x2",x(i));guide.setAttribute("visibility","visible");
        var pieces=[String(t[i]).replace("T"," ")+" AEST"];
        lines.forEach(function(line) {
          var n=line.v && line.v[i];
          pieces.push(line.name+": "+(typeof n==="number"?n.toLocaleString()+" MW":"Not recorded"));
        });
        label.textContent=pieces.join("  ·  ");
      });
      svg.addEventListener("pointerleave",function(){guide.setAttribute("visibility","hidden");label.textContent="";});
    }
    function requestChart(step, retried) {
      return fetch(window.location.origin+"/members/api/session", {credentials:"same-origin"})
        .then(function(r){return r.ok?r.text():"";}).then(function(token){
          if(!token.trim()) throw {status:401,message:"Sign in to view member-only headroom and dispatch data."};
          var url=apiBase+"/api/headroom?view=substation_chart&site_id="+
            encodeURIComponent(site.id)+"&step="+encodeURIComponent(step);
          return fetch(url,{headers:{Authorization:"Bearer "+token.trim()},cache:"no-store"})
            .then(function(response){return response.json().then(function(payload){
              if(response.status===401 && !retried) return requestChart(step,true);
              if(!response.ok) throw {status:response.status,message:payload.message||"Series temporarily unavailable."};
              return payload;
            });});
        });
    }
    function load(){
      var revision=++busy;
      drawEmptyChart("Checking the available substation MW records…");
      assets.replaceChildren();
      // Clear the previous asset labels when switching periods.
      while(legend.children.length>2) legend.lastChild.remove();
      requestChart(period.value,false).then(function(response) {
        if(revision!==busy || !panel.isConnected)return;
        if(response.status!=="available"){
          drawEmptyChart(response.reason||"No verified substation-to-AEMO connection-point mapping is available yet.");
          assets.textContent="Asset contributions (blue, orange and other lines) are not yet available. Each asset needs verified electrical connection and historical DUID output.";
          return;
        }
        status.textContent="AEMO connection point: "+(response.connection_point_label||response.aemo_connection_point_ids[0])+
          " · "+response.start+" to "+response.end+".";
        chartSvg(response);
        assets.textContent=(response.assets||[]).length
          ? "Individual asset MW series shown where verified."
          : "Individual-asset MW traces are not available yet: the current history stores connection-point totals, not per-DUID output.";
      }).catch(function(err) {
        if(revision!==busy || !panel.isConnected)return;
        drawEmptyChart(err&&err.message?err.message:"MW series temporarily unavailable.");
      });
    }
    period.addEventListener("change",load);
    load();
  }

  function showDetail(site, meta) {
    source.hidden = true;
    wrap.replaceChildren();
    var block = el("div", "ps-qs__details");
    wrap.appendChild(block);
    var back = el("button", "ps-qs__back", "← Back to Queensland map");
    back.type = "button";
    back.onclick = function () { navigate(null); };
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

    renderMWChart(block, site);

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
    maps.create(smallMap, { center: [site.longitude, site.latitude], zoom: 12 }).then(function (result) {
      if (!smallMap.isConnected) { result.map.remove(); return; }
      state.detailMap = result.map;
      createMarker(site, result.map, result.lib, 18, false);
      result.map.resize();
    }).catch(function () {
      if (smallMap.isConnected) smallMap.textContent = "Map could not be loaded. Coordinates are listed below.";
    });
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
        button.onclick = function () { navigate(s.id); };
        results.appendChild(button);
      });
      if (records.length > 80) results.appendChild(el("p", "ps-qs__count", "Showing the first 80 names. Search or filter to narrow results."));
      if (state.map && state.lib) {
        state.markers.forEach(function (marker) { marker.remove(); });
        state.markers = records.map(function (site) {
          return createMarker(site, state.map, state.lib, 12, true);
        });
      }
    }
    [search, coverage, status, voltage].forEach(function (node) {
      node.addEventListener(node === search ? "input" : "change", render);
    });

    maps.create(mapNode, { center: [145.5, -21.3], zoom: 5.25 }).then(function (result) {
      if (!mapNode.isConnected) { result.map.remove(); return; }
      state.lib = result.lib;
      state.map = result.map;
      render();
      state.map.resize();
    }).catch(function () {
      if (mapNode.isConnected) {
        mapNode.textContent = "Map could not be loaded. The searchable substation list remains available below.";
        render();
      }
    });
    render();
  }

  // Recognise existing ?substation=ga:82 links, then replace just the
  // client-side URL with the canonical #ps-substation=ga%3A82 form.
  // This avoids another network navigation even for old bookmarked URLs.
  var oldId = new URLSearchParams(window.location.search).get("substation");
  if (oldId && /^ga:[0-9]+$/.test(oldId) && !window.location.hash.startsWith("#ps-substation=")) {
    window.history.replaceState(null, "", pageUrl(oldId));
  }
  window.addEventListener("popstate", showCurrentRoute);
  window.addEventListener("hashchange", showCurrentRoute);
  var loading = el("p", "ps-qs__intro", "Loading Queensland substation records from Geoscience Australia…");
  wrap.appendChild(loading);
  fetch(apiBase + "/api/substations", { cache: "default" })
    .then(function (response) { if (!response.ok) throw Error("GIS source unavailable"); return response.json(); })
    .then(function (meta) {
      if (!meta || !Array.isArray(meta.sites)) throw Error("Invalid substation response");
      state.records = meta.sites;
      loadedMeta = meta;
      showCurrentRoute();
    })
    .catch(function () {
      wrap.replaceChildren();
      var failed = el("p", "ps-qs__error", "Queensland substation locations are temporarily unavailable. The existing Headroom Explorer remains accessible below.");
      wrap.appendChild(failed);
      source.hidden = false;
    });
  }
  ensureMapCore().then(startQueenslandMap).catch(function () {
    wrap.replaceChildren();
    wrap.appendChild(el("p", "ps-qs__error",
      "Queensland map could not load. The existing Headroom Explorer remains accessible below."));
    source.hidden = false;
  });
})();
