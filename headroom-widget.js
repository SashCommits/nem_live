// PowerSocket NEM Headroom Explorer widget, for the Ghost page.
// Embed with the snippet in headroom-page.html: a <div class="pshr"
// data-api="<service URL>"> plus a loader that fetches this file at main's
// exact current commit (an @main URL can be served stale for a day or more).
//
// Subscribers only. The data lives in the private powersocket-grid-headroom
// service, never in this repository or in a public file. The widget asks the
// Ghost site it's embedded in for the signed-in member's identity token
// (/members/api/session) and sends it with every request; the service checks
// the member is a paying subscriber before answering. It loads the location
// list for one project size at a time and each location's detail only when
// it is opened. Subscribers can save locations with private notes, stored
// encrypted by the service.
//
// Layout: NEM-wide figures, a searchable list of connection points (or a
// map of them, coloured by how often each is at its limit -- Leaflet loads
// lazily from cdnjs the first time a viewer opens it), the selected point's
// detail (spill curve, headroom range, headroom over time, the constraint
// that limits it), then how far to trust the numbers and how they are
// calculated. Styles are injected here rather than in the page snippet, so
// layout changes don't need a re-paste in Ghost. The widget sizes itself to
// its container (container queries), not the window.
(function () {
  "use strict";

  var CSS = `
.pshr{container-type:inline-size;font-family:inherit;line-height:1.5;color:var(--hr-ink);
  --hr-ink:#0b0b0b;--hr-ink2:#52514e;--hr-muted:#6e6c66;--hr-grid:#e1e0d9;--hr-axis:#c3c2b7;
  --hr-line:rgba(11,11,11,.12);--hr-wash:rgba(11,11,11,.04);--hr-hover:rgba(42,120,214,.08);--hr-sel:rgba(42,120,214,.14);
  --hr-accent:#2a78d6;--hr-s1:#2a78d6;--hr-s2:#eb6834;--hr-ref:#52514e;--hr-band:#b7d3f6;
  --hr-good:#0ca30c;--hr-warn:#c98500;--hr-serious:#d9602f;--hr-crit:#d03b3b;--hr-bg:#fff;
  --hr-mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
.pshr.hr-dark{--hr-ink:#fff;--hr-ink2:#c3c2b7;--hr-muted:#9a988f;--hr-grid:#2c2c2a;--hr-axis:#45443f;
  --hr-line:rgba(255,255,255,.12);--hr-wash:rgba(255,255,255,.05);--hr-hover:rgba(57,135,229,.12);--hr-sel:rgba(57,135,229,.22);
  --hr-accent:#5598e7;--hr-s1:#3987e5;--hr-s2:#d95926;--hr-ref:#c3c2b7;--hr-band:#1c5cab}
.pshr *{box-sizing:border-box}
.pshr .hr-wrap{display:grid;gap:1.25rem}
.pshr .hr-wrap h3,.pshr .hr-wrap h4,.pshr .hr-wrap h5{margin:0;padding:0;font-family:inherit;letter-spacing:0;text-wrap:balance;color:var(--hr-ink)}
.pshr .hr-wrap h3{font-size:1.15rem;font-weight:600;line-height:1.3}
.pshr .hr-wrap h4{font-size:1rem;font-weight:600;line-height:1.3}
.pshr .hr-wrap h5{font-size:.75rem;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--hr-ink2)}
.pshr .hr-wrap p{margin:0}
.pshr .hr-num{font-variant-numeric:tabular-nums}
.pshr .hr-mono{font-family:var(--hr-mono);font-size:.9em}
.pshr .hr-muted{color:var(--hr-muted)}
.pshr .hr-lede{font-size:.9rem;color:var(--hr-ink2)}
.pshr .hr-fleet{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--hr-line);border:1px solid var(--hr-line);border-radius:10px;overflow:hidden}
.pshr .hr-fleet>div{background:var(--hr-bg);padding:.8rem .9rem;display:grid;gap:2px;align-content:start}
.pshr .hr-fleet .hr-v{font-size:1.5rem;font-weight:600;line-height:1.2}
.pshr .hr-fleet .hr-l{font-size:.8rem;color:var(--hr-ink2);line-height:1.35}
.pshr .hr-main{display:grid;gap:1.25rem;align-items:start}
@container (min-width:860px){.pshr .hr-main{grid-template-columns:minmax(290px,370px) 1fr}.pshr .hr-tablewrap{max-height:760px}}
.pshr .hr-panel{border:1px solid var(--hr-line);border-radius:10px;background:var(--hr-bg)}
.pshr .hr-list{display:grid;grid-template-rows:auto 1fr;min-height:0}
.pshr .hr-controls{padding:.8rem;display:grid;gap:.6rem;border-bottom:1px solid var(--hr-line)}
.pshr .hr-controls label{font-size:.8rem;color:var(--hr-ink2)}
.pshr input[type=search],.pshr select{font:inherit;font-size:.9rem;color:var(--hr-ink);background:var(--hr-wash);border:1px solid var(--hr-line);border-radius:7px;padding:.45rem .6rem;width:100%;margin:0}
.pshr input[type=search]:focus-visible,.pshr select:focus-visible,.pshr button:focus-visible,.pshr .hr-row:focus-visible{outline:2px solid var(--hr-accent);outline-offset:1px}
.pshr .hr-chips{display:flex;flex-wrap:wrap;gap:6px}
.pshr button.hr-chip{font:inherit;font-size:.8rem;line-height:1.4;color:var(--hr-ink2);background:transparent;border:1px solid var(--hr-line);border-radius:999px;padding:2px 10px;cursor:pointer;margin:0}
.pshr button.hr-chip[aria-pressed=true]{background:var(--hr-ink);color:var(--hr-bg);border-color:var(--hr-ink)}
.pshr .hr-ctlrow{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;font-size:.8rem;color:var(--hr-ink2)}
.pshr .hr-ctlrow select{width:auto}
.pshr .hr-tablewrap{overflow:auto;max-height:22rem;position:relative}
.pshr .hr-map-wrap{height:26rem;border-radius:8px;overflow:hidden;position:relative;background:var(--hr-wash)}
@container (min-width:860px){.pshr .hr-map-wrap{height:36rem}}
.pshr .hr-map-wrap .leaflet-container{background:var(--hr-wash);font:inherit}
.pshr .hr-map-wrap .leaflet-control-attribution{font-size:.65rem;color:var(--hr-ink2)}
.pshr .hr-pin{border-radius:50%;border:2px solid var(--hr-bg)}
.pshr .hr-pin.hr-sel{border-color:var(--hr-accent);border-width:3px}
.pshr .hr-maplegend{display:flex;flex-wrap:wrap;gap:.5rem 1rem;font-size:.75rem;color:var(--hr-ink2);padding:.5rem .8rem 0}
.pshr .hr-maplegend span{display:inline-flex;align-items:center;gap:5px}
.pshr .hr-mapnote{font-size:.72rem;color:var(--hr-muted);padding:.3rem .8rem .6rem}
/* Ghost themes style article tables (e.g. .gh-content table:not(.gist table) td); these class-qualified selectors outrank them. */
.pshr .hr-wrap table.hr-t{display:table;width:100%;max-width:none;margin:0;border:0;border-collapse:collapse;border-spacing:0;background:none;font-size:.8rem;white-space:normal;overflow:visible;box-shadow:none}
.pshr .hr-wrap table.hr-t th,.pshr .hr-wrap table.hr-t td{border:0;background:none;font-size:inherit;text-transform:none;letter-spacing:normal;line-height:1.4;color:var(--hr-ink)}
.pshr .hr-wrap table.hr-t thead th{position:sticky;top:0;background:var(--hr-bg);z-index:1;text-align:left;font-weight:500;color:var(--hr-ink2);padding:.45rem .6rem;border-bottom:1px solid var(--hr-line);white-space:nowrap}
.pshr thead th button{all:unset;cursor:pointer}
.pshr thead th button:focus-visible{outline:2px solid var(--hr-accent)}
.pshr .hr-list table.hr-t th:first-child{width:55%}
.pshr .hr-wrap table.hr-t tbody td{padding:.4rem .6rem;border-bottom:1px solid var(--hr-line);vertical-align:top;color:var(--hr-ink)}
.pshr .hr-row{cursor:pointer}
.pshr .hr-row:hover{background:var(--hr-hover)}
.pshr .hr-row[aria-selected=true]{background:var(--hr-sel)}
.pshr .hr-row .hr-n{font-weight:500}
.pshr .hr-row .hr-c{font-family:var(--hr-mono);font-size:.7rem;color:var(--hr-muted)}
.pshr .hr-detail{padding:1.1rem;display:grid;gap:1.4rem;min-width:0}
.pshr .hr-dhead{display:grid;gap:.35rem}
.pshr .hr-ids{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:.8rem;color:var(--hr-ink2)}
.pshr .hr-pill{display:inline-flex;align-items:center;gap:6px;font-size:.8rem;font-weight:500;padding:1px 10px 1px 8px;border-radius:999px;border:1px solid var(--hr-line);width:fit-content}
.pshr .hr-pill svg{flex:none}
.pshr .hr-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem 1.4rem}
.pshr .hr-stat{display:grid;gap:2px;align-content:start}
.pshr .hr-stat .hr-l{font-size:.8rem;color:var(--hr-ink2);line-height:1.35}
.pshr .hr-stat .hr-v{font-size:1.4rem;font-weight:600;line-height:1.25}
.pshr .hr-stat .hr-f{font-size:.75rem;color:var(--hr-muted);line-height:1.4}
.pshr .hr-block{display:grid;gap:.6rem;min-width:0}
.pshr .hr-bhead{display:flex;justify-content:space-between;align-items:baseline;gap:.75rem;flex-wrap:wrap}
.pshr .hr-seg{display:inline-flex;border:1px solid var(--hr-line);border-radius:7px;overflow:hidden}
.pshr .hr-seg button{font:inherit;font-size:.8rem;background:transparent;color:var(--hr-ink2);border:0;padding:3px 12px;cursor:pointer;margin:0}
.pshr .hr-seg button[aria-pressed=true]{background:var(--hr-ink);color:var(--hr-bg)}
.pshr .hr-legend{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:.8rem;color:var(--hr-ink2)}
.pshr .hr-legend span{display:inline-flex;align-items:center;gap:6px}
.pshr .hr-chart{position:relative;min-width:0}
.pshr .hr-chart svg{display:block;width:100%;height:auto;overflow:visible}
.pshr .hr-chart text{font-family:inherit;fill:var(--hr-muted);font-size:11.5px}
.pshr .hr-tip{position:absolute;pointer-events:none;background:var(--hr-ink);color:var(--hr-bg);font-size:.78rem;line-height:1.4;padding:6px 8px;border-radius:6px;white-space:nowrap;z-index:5;font-variant-numeric:tabular-nums}
.pshr .hr-note{font-size:.8rem;color:var(--hr-ink2);max-width:72ch;line-height:1.5}
.pshr .hr-cons{display:grid;gap:.75rem}
.pshr .hr-con{display:grid;gap:2px;padding-left:.75rem;border-left:2px solid var(--hr-grid)}
.pshr .hr-con .hr-h{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:.8rem;color:var(--hr-ink2)}
.pshr .hr-con .hr-d{font-size:.88rem;max-width:80ch;overflow-wrap:anywhere}
.pshr details summary{cursor:pointer;font-size:.8rem;color:var(--hr-ink2)}
.pshr .hr-dt{overflow-x:auto}
.pshr .hr-wrap .hr-dt table.hr.pshr .hr-wrap table.hr-t .hr-r,.pshr .hr-r{text-align:right}
-t td,.pshr .hr-wrap .hr-dt table.hr-t th{padding:.3rem .5rem}
.pshr .hr-lower{display:grid;gap:1.25rem}
@container (min-width:760px){.pshr .hr-lower{grid-template-columns:1fr 1fr}}
.pshr .hr-lower .hr-panel{padding:1.1rem;display:grid;gap:.7rem;align-content:start}
.pshr .hr-wrap ol.hr-steps{margin:0;padding-left:1.2rem;display:grid;gap:.5rem;font-size:.88rem}
.pshr .hr-wrap ol.hr-steps li{margin:0;padding-left:.2rem}
.pshr .hr-foot{font-size:.75rem;color:var(--hr-muted);max-width:90ch;line-height:1.5}
.pshr .hr-steps-scroll{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}
.pshr .hr-steps-scroll .hr-seg button{white-space:nowrap}
.pshr .hr-nav{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;font-size:.82rem;color:var(--hr-ink2)}
.pshr .hr-nav button{font:inherit;font-size:.82rem;background:transparent;color:var(--hr-ink);border:1px solid var(--hr-line);border-radius:7px;padding:2px 10px;cursor:pointer;margin:0}
.pshr .hr-nav button[disabled]{opacity:.35;cursor:default}
.pshr .hr-gate{border:1px solid var(--hr-line);border-radius:10px;padding:1.5rem 1.25rem;display:grid;gap:.75rem;justify-items:start}
.pshr .hr-gate p{color:var(--hr-ink2);font-size:.95rem;max-width:60ch}
.pshr .hr-actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.pshr a.hr-btn,.pshr button.hr-btn{display:inline-block;font:inherit;font-size:.85rem;font-weight:500;line-height:1.3;text-decoration:none;cursor:pointer;border-radius:7px;padding:.45rem .9rem;margin:0;border:1px solid var(--hr-ink);background:var(--hr-ink);color:var(--hr-bg)}
.pshr a.hr-btn.hr-quiet,.pshr button.hr-btn.hr-quiet{background:transparent;color:var(--hr-ink);border-color:var(--hr-line)}
.pshr button.hr-btn[disabled]{opacity:.5;cursor:default}
.pshr button.hr-link{all:unset;cursor:pointer;font-size:.75rem;color:var(--hr-ink2);text-decoration:underline;text-underline-offset:3px}
.pshr button.hr-link:focus-visible{outline:2px solid var(--hr-accent)}
.pshr .hr-star{color:var(--hr-warn);margin-right:4px}
.pshr .hr-mine{display:grid;gap:.5rem;padding:.9rem;border-radius:8px;background:var(--hr-wash)}
.pshr .hr-mine textarea{font:inherit;font-size:.88rem;color:var(--hr-ink);background:var(--hr-bg);border:1px solid var(--hr-line);border-radius:7px;padding:.5rem .6rem;width:100%;min-height:4.5rem;resize:vertical;margin:0}
.pshr .hr-mine textarea:focus-visible{outline:2px solid var(--hr-accent);outline-offset:1px}
.pshr .hr-msg{font-size:.78rem;color:var(--hr-muted)}
.pshr .hr-status{padding:2rem 1rem;text-align:center;font-size:.9rem;color:var(--hr-ink2)}
.pshr .hr-error{border:1px solid rgba(200,80,80,.5);border-radius:8px}
@media (prefers-reduced-motion:no-preference){.pshr .hr-row,.pshr button.hr-chip,.pshr .hr-seg button{transition:background-color 120ms}}
`;

  var REG = { NSW1: "NSW", QLD1: "QLD", VIC1: "VIC", SA1: "SA", TAS1: "TAS" };
  var STEPS = [["5m", "5 min"], ["30m", "30 min"], ["1h", "Hour"], ["1d", "Day"], ["7d", "Week"], ["1mo", "Month"], ["3mo", "Quarter"], ["1y", "Year"]];

  function injectCss() {
    if (document.getElementById("pshr-css")) return;
    var s = document.createElement("style");
    s.id = "pshr-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Light or dark from the text colour the site gives us, so it follows the
  // Ghost theme toggle as well as the OS setting.
  function isDark(node) {
    var m = getComputedStyle(node).color.match(/\d+(\.\d+)?/g);
    if (!m) return false;
    return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 > 0.6;
  }

  function pageBackground(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
      var bg = getComputedStyle(n).backgroundColor;
      if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
    }
    return "#ffffff";
  }

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  var fmtPct = function (v, d) {
    if (v == null) return "–";
    return (v < 0.05 && v > 0 ? "<0.1" : v.toFixed(d == null ? 1 : d)) + "%";
  };
  var fmtMW = function (v) { return v == null ? "no limit" : Math.round(v).toLocaleString() + " MW"; };
  var monthLabel = function (m) { return new Date(m + "-01T00:00:00").toLocaleString("en-AU", { month: "short" }); };
  var monthLong = function (m) { return new Date(m + "-01T00:00:00").toLocaleString("en-AU", { month: "long", year: "numeric" }); };
  var status = function (at) {
    return at < 2 ? ["good", "Rarely at limit"] : at < 10 ? ["warn", "Sometimes at limit"] : at < 25 ? ["serious", "Often at limit"] : ["crit", "Mostly at limit"];
  };
  var statusIcon = function (k) {
    return {
      good: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--hr-good)"/></svg>',
      warn: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 10H1Z" fill="var(--hr-warn)"/></svg>',
      serious: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" transform="rotate(45 6 6)" fill="var(--hr-serious)"/></svg>',
      crit: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="1.5" fill="var(--hr-crit)"/></svg>'
    }[k];
  };
  var svgOpen = function (w, h) { return '<svg viewBox="0 0 ' + w + " " + h + '" role="img">'; };
  // Tick counts that give whole-number labels for every maximum niceMax returns.
  var ticksFor = function (ymax) { return ymax % 5 === 0 ? 5 : 4; };
  var niceMax = function (v) {
    var s = [10, 20, 25, 50, 100];
    for (var i = 0; i < s.length; i++) if (v <= s[i]) return s[i];
    return Math.ceil(v / 20) * 20;
  };

  // Leaflet (map view) loads once per page, only if a viewer opens the map.
  var LEAFLET_V = "1.9.4", leafletP = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/" + LEAFLET_V + "/leaflet.min.css";
      document.head.appendChild(css);
      var js = document.createElement("script");
      js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/" + LEAFLET_V + "/leaflet.min.js";
      js.onload = function () { resolve(window.L); };
      js.onerror = function () { reject(new Error("Couldn't load the map library.")); };
      document.head.appendChild(js);
    });
    return leafletP;
  }

  var SHELL = `
<div class="hr-wrap">
  <p class="hr-lede"><span data-hr="period"></span> Source: AEMO dispatch data. Headroom and spill are The Power Socket's calculations.</p>
  <section class="hr-fleet" aria-label="Across the NEM">
    <div><span class="hr-v hr-num" data-hr="f-points"></span><span class="hr-l">connection points where a network constraint was active</span></div>
    <div><span class="hr-v hr-num" data-hr="f-solar"></span><span class="hr-l">of existing solar farms' output held back by network or security limits</span></div>
    <div><span class="hr-v hr-num" data-hr="f-wind"></span><span class="hr-l">of existing wind farms' output held back by network or security limits</span></div>
    <div><span class="hr-v hr-num" data-hr="f-val"></span><span class="hr-l">of the time AEMO held a farm back where we compute zero headroom</span></div>
  </section>
  <div class="hr-main">
    <div class="hr-panel hr-list" role="region" aria-label="Connection points">
      <div class="hr-controls">
        <label data-hr="q-label">Find a station or connection point</label>
        <input data-hr="q" type="search" placeholder="e.g. White Rock, Bayswater, NWGJ1J" autocomplete="off">
        <div class="hr-chips" data-hr="regions" role="group" aria-label="Region"></div>
        <div class="hr-ctlrow">
          <label data-hr="size-label">New project size</label>
          <select data-hr="size"></select>
          <span data-hr="count" class="hr-muted"></span>
          <div class="hr-seg" role="group" aria-label="View" data-hr="view" style="margin-left:auto">
            <button type="button" data-v="list" aria-pressed="true">List</button>
            <button type="button" data-v="map" aria-pressed="false">Map</button>
          </div>
        </div>
      </div>
      <div class="hr-tablewrap" data-hr="listview">
        <table class="hr-t">
          <thead><tr>
            <th><button data-sort="name">Location</button></th>
            <th class="hr-r"><button data-sort="at">At limit</button></th>
            <th class="hr-r"><button data-sort="solar">Solar spill</button></th>
            <th class="hr-r"><button data-sort="wind">Wind spill</button></th>
          </tr></thead>
          <tbody data-hr="rows"></tbody>
        </table>
      </div>
      <div data-hr="mapview" hidden>
        <div class="hr-maplegend">
          <span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="var(--hr-good)"/></svg>Rarely at limit</span>
          <span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="var(--hr-warn)"/></svg>Sometimes</span>
          <span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="var(--hr-serious)"/></svg>Often</span>
          <span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="var(--hr-crit)"/></svg>Mostly at limit</span>
        </div>
        <div class="hr-map-wrap" data-hr="map"></div>
        <p class="hr-mapnote" data-hr="mapnote"></p>
      </div>
    </div>
    <div class="hr-panel hr-detail" data-hr="detail" aria-live="polite"></div>
  </div>
  <div class="hr-lower">
    <section class="hr-panel">
      <h4>How far to trust these numbers</h4>
      <p class="hr-note">AEMO flags every five minutes when it holds a solar or wind farm below what it could produce. That flag comes from a different AEMO table than our headroom calculation, so it is an independent check. Where we compute zero headroom at a farm's connection point, AEMO held the farm back almost every time.</p>
      <div class="hr-dt" data-hr="valtable"></div>
      <p class="hr-note">Spill for a new project is modelled, not observed. The sharing figure is the central estimate: for a 50 MW project it lands within a median 0.9 percentage points of what existing farms at the same points actually lost. The behind-existing-farms figure is the pessimistic case. AEMO tends to cut the farms with the largest effect on a congested line first, so sharing understates spill at those points and overstates it at the others.</p>
    </section>
    <section class="hr-panel">
      <h4>How it's calculated</h4>
      <ol class="hr-steps">
        <li><strong>Every five minutes</strong>, AEMO dispatches the market subject to network constraints: equations that keep each line and transformer within its limit, and the system stable, if something else trips. It publishes how close each one came to its limit and how strongly each connection point pushes on it.</li>
        <li><strong>Headroom</strong> is the extra megawatts a connection point could have injected before its tightest active constraint reached its limit, at AEMO's actual dispatch. We compute it for every interval in the year.</li>
        <li><strong>Spill</strong> adds a new solar or wind farm of the chosen size, running on the output pattern of existing farms nearby, and counts the energy that would not fit. Two rules for sharing room with farms already there give the central and pessimistic cases.</li>
        <li><strong>Existing farms</strong> shows what AEMO actually held back from the farms already at that connection point, with no modelling.</li>
      </ol>
      <p class="hr-note">To check a location against another source, compare it with AEMO's Enhanced Locational Information report, which ranks congestion at around 160 locations.</p>
    </section>
  </div>
  <p class="hr-foot" data-hr="privacy">Locations you save and your notes are stored encrypted and only you can see them. <button type="button" class="hr-link" data-hr="wipe">Delete everything I've saved</button></p>
  <p class="hr-foot">Source: Australian Energy Market Operator (AEMO), market management system data (DISPATCHCONSTRAINT, DISPATCHLOAD, GENCONDATA, SPDCONNECTIONPOINTCONSTRAINT, DUDETAILSUMMARY, GENUNITS, STATION), <span data-hr="foot-period"></span>. Data processed by The Power Socket. Headroom is the extra injection a location could take before its tightest active network constraint binds, at AEMO's actual dispatch. A blank percentile means no network constraint was active in that share of intervals, which is not the same as unlimited.</p>
</div>`;

  var PORTAL = { signup: "#/portal/signup", signin: "#/portal/signin", plans: "#/portal/account/plans" };

  // Talks to the service on behalf of the signed-in Ghost member.
  function client(root) {
    var ghost = (root.dataset.ghost || location.origin).replace(/\/$/, "");
    var base = root.dataset.api.replace(/\/$/, "");
    var tok = null;
    function session(fresh) {
      if (tok && !fresh) return Promise.resolve(tok);
      return fetch(ghost + "/members/api/session", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (t) { tok = (t || "").trim() || null; return tok; });
    }
    function fail(status, code, message) { var e = new Error(message); e.status = status; e.code = code; return e; }
    function call(path, opts, retried) {
      opts = opts || {};
      return session(retried).then(function (t) {
        if (!t) throw fail(401, "signed_out", "Please sign in.");
        var headers = { Authorization: "Bearer " + t };
        if (opts.body) headers["Content-Type"] = "application/json";
        return fetch(base + path, { method: opts.method || "GET", headers: headers, body: opts.body, cache: "no-store" });
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          // Identity tokens are short-lived: fetch a fresh one once and retry.
          if (r.status === 401 && !retried) return call(path, opts, true);
          if (!r.ok) throw fail(r.status, b.error || "http", b.message || "Something went wrong (HTTP " + r.status + ").");
          return b;
        });
      }, function (e) {
        if (e.code) throw e;
        throw fail(0, "network", "Couldn't reach the headroom service. Check your connection and try again.");
      });
    }
    return {
      list: function (size) { return call("/api/headroom?view=list&size=" + size); },
      point: function (id) { return call("/api/headroom?view=point&id=" + encodeURIComponent(id)); },
      load: function (name) { return call("/api/saved?name=" + name); },
      save: function (name, value) { return call("/api/saved?name=" + name, { method: "PUT", body: JSON.stringify({ value: value }) }); },
      wipe: function () { return call("/api/saved?all=1", { method: "DELETE" }); },
      series: function (id, step, end) {
        return call("/api/headroom?view=series&id=" + encodeURIComponent(id) + "&step=" + step + (end ? "&end=" + end : ""));
      }
    };
  }

  function gate(root, e) {
    var link = function (href, label, quiet) { return '<a class="hr-btn' + (quiet ? " hr-quiet" : "") + '" href="' + esc(href) + '">' + label + "</a>"; };
    var html;
    if (e.code === "signed_out") {
      html = "<h4>The Headroom Explorer is for subscribers</h4><p>See where the NEM has room for new solar, wind and storage: network headroom, spill for a new project and the constraint that limits every connection point.</p>" +
        '<div class="hr-actions">' + link(root.dataset.signup || PORTAL.signup, "Subscribe") + link(PORTAL.signin, "Sign in", true) + "</div>";
    } else if (e.code === "not_subscribed" || e.code === "wrong_tier") {
      html = "<h4>Your plan doesn't include the Headroom Explorer</h4><p>" + esc(e.message) + '</p><div class="hr-actions">' + link(root.dataset.upgrade || PORTAL.plans, "See plans") + "</div>";
    } else {
      html = "<h4>The Headroom Explorer couldn't load</h4><p>" + esc(e.message) + '</p><div class="hr-actions"><button type="button" class="hr-btn hr-quiet" data-hr="retry">Try again</button></div>';
    }
    root.innerHTML = '<div class="hr-wrap"><div class="hr-gate">' + html + "</div></div>";
    var retry = root.querySelector('[data-hr="retry"]');
    if (retry) retry.addEventListener("click", function () { start(root); });
  }

  function start(root) {
    var api = root._hrApi;
    root.innerHTML = '<div class="hr-status">Loading the headroom explorer\u2026</div>';
    Promise.all([api.list(300), api.load("locations")])
      .then(function (r) { build(root, r[0], (r[1] && r[1].value) || {}, api, root._hrTheme); })
      .catch(function (e) { gate(root, e); });
  }

  function initWidget(root) {
    if (!root.dataset.api || root.dataset.hrReady) return;
    root.dataset.hrReady = "1";
    injectCss();
    root.classList.add("pshr");

    function applyTheme() {
      // Read the surrounding page, not the widget: .pshr sets its own colour.
      var host = root.parentElement || document.body;
      root.classList.toggle("hr-dark", isDark(host));
      root.style.setProperty("--hr-bg", pageBackground(host));
    }
    applyTheme();
    // Follow the site's light/dark toggle (Ghost themes flip a class or data
    // attribute on <html> or <body>); colours are CSS variables, so only the
    // variables need re-reading.
    var watcher = new MutationObserver(applyTheme);
    [document.documentElement, document.body].forEach(function (n) {
      if (n) watcher.observe(n, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", function () { setTimeout(applyTheme, 50); });
    }
    root._hrApi = client(root);
    root._hrTheme = applyTheme;
    start(root);
  }

  function build(root, D, saved, api) {
    root.innerHTML = SHELL;
    var uid = "hr" + Math.random().toString(36).slice(2, 8);
    var $ = function (k) { return root.querySelector('[data-hr="' + k + '"]'); };
    $("q").id = uid + "-q"; $("q-label").htmlFor = uid + "-q";
    $("size").id = uid + "-size"; $("size-label").htmlFor = uid + "-size";

    var byId = new Map(D.points.map(function (p) { return [p.id, p]; }));
    var details = new Map();
    var nameOf = function (p) { return p.names.length ? p.names.join(" / ") : p.id; };
    var map = null, mapMarkers = new Map(), mapErr = false, lastFit = null;

    var per = D.period.split("..");
    $("period").textContent = monthLong(per[0]) + " to " + monthLong(per[1]) + ", every five-minute interval.";
    $("foot-period").textContent = monthLong(per[0]) + " to " + monthLong(per[1]);
    $("f-points").textContent = D.count.toLocaleString();
    // Network limits plus caps on particular farms: AEMO's "network curtailment".
    var lim = function (f) { return (f.limits != null ? f.limits : f.net).toFixed(1) + "%"; };
    $("f-solar").textContent = lim(D.fleet.solar);
    $("f-wind").textContent = lim(D.fleet.wind);
    var atLim = D.validation.filter(function (v) { return v.headroom_band.indexOf("<1") === 0; });
    var capped = atLim.reduce(function (a, v) { return a + v.capped; }, 0);
    var total = atLim.reduce(function (a, v) { return a + v.unit_intervals; }, 0);
    $("f-val").textContent = (100 * capped / total).toFixed(1) + "%";

    var bands = { "<1 MW (at limit)": "Under 1 MW (at the limit)", "1-50 MW": "1 to 50 MW", ">=50 MW": "50 MW or more", "no invoked limit": "No network constraint active" };
    $("valtable").innerHTML = '<table class="hr-t"><thead><tr><th>Our computed headroom</th><th class="hr-r">Solar held back</th><th class="hr-r">Wind held back</th></tr></thead><tbody>' +
      Object.keys(bands).map(function (b) {
        var cell = function (t) {
          var r = D.validation.find(function (v) { return v.tech === t && v.headroom_band === b; });
          return r ? (100 * r.capped_share).toFixed(1) + "%" : "–";
        };
        return '<tr><td>' + bands[b] + '</td><td class="hr-r hr-num">' + cell("solar") + '</td><td class="hr-r hr-num">' + cell("wind") + "</td></tr>";
      }).join("") + "</tbody></table>";

    var state = { q: "", region: "ALL", sizeIdx: Math.max(0, D.sizes.indexOf(300)), sort: "at", dir: -1, sel: null, tech: "solar", step: "1d", end: null, view: "list" };
    var sizeSel = $("size");
    sizeSel.innerHTML = D.sizes.map(function (s, i) { return '<option value="' + i + '">' + s + " MW</option>"; }).join("");
    sizeSel.value = String(state.sizeIdx);
    sizeSel.addEventListener("change", function () {
      var idx = +sizeSel.value;
      sizeSel.disabled = true;
      api.list(D.sizes[idx]).then(function (L) {
        D.points = L.points; byId = new Map(D.points.map(function (p) { return [p.id, p]; }));
        state.sizeIdx = idx; renderList(); renderDetail();
      }, function (e) { sizeSel.value = String(state.sizeIdx); showError(e); })
        .then(function () { sizeSel.disabled = false; });
    });

    var regions = ["ALL", "NSW1", "QLD1", "VIC1", "SA1", "TAS1", "SAVED"];
    function renderChips() {
      $("regions").innerHTML = regions.map(function (r) {
        var label = r === "ALL" ? "All regions" : r === "SAVED" ? "\u2605 Saved (" + Object.keys(saved).length + ")" : REG[r];
        return '<button type="button" class="hr-chip" data-r="' + r + '" aria-pressed="' + (r === state.region) + '">' + label + "</button>";
      }).join("");
    }
    renderChips();
    $("regions").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      state.region = b.dataset.r;
      Array.prototype.forEach.call($("regions").children, function (c) { c.setAttribute("aria-pressed", String(c === b)); });
      renderList();
    });
    $("q").addEventListener("input", function (e) { state.q = e.target.value.trim().toLowerCase(); renderList(); });
    root.querySelectorAll("thead button[data-sort]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.dataset.sort;
        state.dir = state.sort === k ? -state.dir : (k === "name" ? 1 : -1);
        state.sort = k; renderList();
      });
    });

    // The list carries spill for the selected size only (p.solar, p.wind).
    var spillAt = function (p, tech) { return p[tech]; };
    function filteredPoints() {
      return D.points.filter(function (p) {
        return (state.region === "ALL" || p.region === state.region || (state.region === "SAVED" && saved[p.id])) &&
          (!state.q || p.id.toLowerCase().indexOf(state.q) >= 0 || p.names.join(" ").toLowerCase().indexOf(state.q) >= 0 || p.duids.join(" ").toLowerCase().indexOf(state.q) >= 0);
      });
    }
    function renderList() {
      var pts = filteredPoints();
      $("count").textContent = pts.length + " shown";
      if (state.view === "map") { renderMap(pts); return; }
      $("listview").hidden = false; $("mapview").hidden = true;
      var key = {
        name: function (p) { return nameOf(p).toLowerCase(); },
        at: function (p) { return p.at == null ? -1 : p.at; },
        solar: function (p) { var v = spillAt(p, "solar"); return v == null ? -1 : v; },
        wind: function (p) { var v = spillAt(p, "wind"); return v == null ? -1 : v; }
      }[state.sort];
      pts.sort(function (a, b) { var x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * state.dir; });
      $("rows").innerHTML = pts.map(function (p) {
        return '<tr class="hr-row" tabindex="0" data-id="' + esc(p.id) + '" aria-selected="' + (p.id === state.sel) + '">' +
          '<td><div class="hr-n">' + (saved[p.id] ? '<span class="hr-star" aria-label="Saved">\u2605</span>' : "") + esc(nameOf(p)) + '</div><div class="hr-c">' + esc(p.id) + " · " + (REG[p.region] || esc(p.region)) + "</div></td>" +
          '<td class="hr-r hr-num">' + fmtPct(p.at) + "</td>" +
          '<td class="hr-r hr-num">' + fmtPct(spillAt(p, "solar"), 0) + "</td>" +
          '<td class="hr-r hr-num">' + fmtPct(spillAt(p, "wind"), 0) + "</td></tr>";
      }).join("");
    }
    function markerColor(p) { return "var(--hr-" + (p.at == null ? "ink2" : status(p.at)[0]) + ")"; }
    function styleMarker(id) {
      var m = mapMarkers.get(id); if (!m) return;
      var sel = id === state.sel;
      m.setStyle({ weight: sel ? 3 : 2, color: sel ? "var(--hr-accent)" : "var(--hr-bg)", radius: sel ? 8 : 6 });
      if (sel) m.bringToFront();
    }
    // Many stations only resolve to their town, or to the same site under
    // two names (a power station and its battery), so pins can sit on top of
    // one another and only the top one would be clickable. Once zoomed in far
    // enough to be choosing between individual sites, overlapping pins are
    // pushed apart just far enough not to touch -- each stays as near its
    // true position as the crowd allows. Below that zoom, clicking a crowded
    // pin zooms in to it instead of picking whichever happens to be on top.
    // Pins are ~14 px across, a selected one ~19 px: NEAR is where two start
    // to overlap, SPACING leaves room for a selected pin beside a plain one.
    var FAN_ZOOM = 7, NEAR = 16, SPACING = 19;
    function crowded(id) {
      var z = map.getZoom(), a = map.project(mapMarkers.get(id)._hrBase, z), hit = false;
      mapMarkers.forEach(function (m, other) { if (other !== id && a.distanceTo(map.project(m._hrBase, z)) < NEAR) hit = true; });
      return hit;
    }
    function placeMarkers() {
      if (!map) return;
      var z = map.getZoom();
      if (z < FAN_ZOOM) { mapMarkers.forEach(function (m) { m.setLatLng(m._hrBase); }); return; }
      var ids = []; mapMarkers.forEach(function (m, id) { ids.push(id); });
      ids.sort(); // deterministic: the same pins always settle the same way
      var P = ids.map(function (id) { var q = map.project(mapMarkers.get(id)._hrBase, z); return [q.x, q.y]; });
      // Exact duplicates have no direction to separate along: start them on a
      // small golden-angle spiral.
      var dup = new Map();
      P.forEach(function (p) {
        var k = Math.round(p[0]) + "," + Math.round(p[1]), n = dup.get(k) || 0;
        dup.set(k, n + 1);
        if (n) { p[0] += 2 * n * Math.cos(n * 2.4); p[1] += 2 * n * Math.sin(n * 2.4); }
      });
      var cell = function (v) { return Math.floor(v / SPACING); };
      for (var it = 0; it < 80; it++) {
        var grid = new Map(), moved = false;
        P.forEach(function (p, i) { var k = cell(p[0]) + "," + cell(p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
        P.forEach(function (p, i) {
          for (var gx = cell(p[0]) - 1; gx <= cell(p[0]) + 1; gx++) for (var gy = cell(p[1]) - 1; gy <= cell(p[1]) + 1; gy++) {
            (grid.get(gx + "," + gy) || []).forEach(function (j) {
              if (j <= i) return;
              var q = P[j], vx = q[0] - p[0], vy = q[1] - p[1], d = Math.hypot(vx, vy);
              if (d >= SPACING) return;
              if (d < 1e-6) { vx = 1; vy = 0; d = 1; }
              var push = (SPACING - d) / 2 + 0.01;
              vx /= d; vy /= d;
              p[0] -= vx * push; p[1] -= vy * push; q[0] += vx * push; q[1] += vy * push;
              moved = true;
            });
          }
        });
        if (!moved) break;
      }
      ids.forEach(function (id, i) { mapMarkers.get(id).setLatLng(map.unproject(P[i], z)); });
    }
    function renderMap(pts) {
      $("listview").hidden = true; $("mapview").hidden = false;
      if (mapErr) return;
      loadLeaflet().then(function (L) {
        if (!root.isConnected) return; // widget torn down while the library was loading
        if (!map) {
          map = L.map($("map"), { scrollWheelZoom: false, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 1 }).setView([-27, 134], 4);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18, attribution: "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a> contributors"
          }).addTo(map);
          map.on("zoomend", placeMarkers);
        }
        var withPos = pts.filter(function (p) { return p.lat != null && p.lon != null; });
        var seen = new Set(withPos.map(function (p) { return p.id; }));
        mapMarkers.forEach(function (m, id) { if (!seen.has(id)) { map.removeLayer(m); mapMarkers.delete(id); } });
        withPos.forEach(function (p) {
          var m = mapMarkers.get(p.id);
          if (!m) {
            m = L.circleMarker([p.lat, p.lon], { radius: 6, weight: 2, color: "var(--hr-bg)", fillColor: markerColor(p), fillOpacity: 0.9 })
              .addTo(map).on("click", function () {
                // A stack at country scale: zoom in to it rather than picking
                // whichever of its pins happens to be on top.
                if (map.getZoom() < FAN_ZOOM && crowded(p.id)) map.setView(m._hrBase, FAN_ZOOM + 1);
                else pick(p.id);
              });
            m.bindTooltip(esc(nameOf(p)));
            mapMarkers.set(p.id, m);
          } else {
            m.setStyle({ fillColor: markerColor(p) });
          }
          m._hrBase = [p.lat, p.lon];
        });
        placeMarkers();
        mapMarkers.forEach(function (m, id) { styleMarker(id); });
        var missing = pts.length - withPos.length;
        $("mapnote").textContent = (missing > 0
          ? missing + " of " + pts.length + " shown locations aren't placed yet (no station address we could match to a map position); use the list to reach them. "
          : "") + "Positions are approximate: for many stations, the town in AEMO's registered address. Zoomed in, pins that would overlap are nudged apart.";
        // Refit only when the set of pins changes (a filter), not on every
        // redraw -- picking a pin redraws too, and mustn't undo the viewer's zoom.
        var fitKey = withPos.map(function (p) { return p.id; }).join(",");
        if (fitKey !== lastFit) {
          lastFit = fitKey;
          setTimeout(function () { map.invalidateSize(); if (withPos.length) map.fitBounds(withPos.map(function (p) { return [p.lat, p.lon]; }), { padding: [24, 24], maxZoom: 9 }); }, 0);
        } else {
          setTimeout(function () { map.invalidateSize(); }, 0);
        }
      }, function (e) {
        mapErr = true;
        $("map").innerHTML = '<div class="hr-status">' + esc(e.message) + "</div>";
      });
    }
    $("view").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      state.view = b.dataset.v;
      Array.prototype.forEach.call($("view").children, function (c) { c.setAttribute("aria-pressed", String(c === b)); });
      renderList();
    });
    function pick(id) {
      if (!byId.has(id)) return;
      state.sel = id; state.end = null; renderList(); renderDetail();
      if (map) styleMarker(id);
      // Single column (phones, narrow themes): the detail sits below the list.
      var det = $("detail"), list = root.querySelector(".hr-list");
      if (det.offsetTop > list.offsetTop + list.offsetHeight - 2 && det.getBoundingClientRect().top > window.innerHeight * 0.6) {
        det.scrollIntoView({ block: "start", behavior: "smooth" });
      }
      try { history.replaceState(null, "", "#" + id); } catch (e) { /* not essential */ }
    }
    $("rows").addEventListener("click", function (e) { var r = e.target.closest(".hr-row"); if (r) pick(r.dataset.id); });
    $("rows").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var r = e.target.closest(".hr-row"); if (r) { e.preventDefault(); pick(r.dataset.id); }
    });

    function spillChart(p, tech, box) {
      var s = p.spill[tech], o = p.obs[tech];
      if (!s) { box.innerHTML = '<p class="hr-note">No ' + tech + " farms operate in this region, so there is no " + tech + " output pattern to model with.</p>"; return; }
      var W = Math.max(300, box.clientWidth || 600), H = 240, m = { l: 44, r: 16, t: 14, b: 34 };
      var xs = D.sizes, ymax = niceMax(Math.max.apply(null, [10].concat(s.behind, s.shared, o ? [o.net] : [])));
      var X = function (v) { return m.l + (v - xs[0]) / (xs[xs.length - 1] - xs[0]) * (W - m.l - m.r); };
      var Y = function (v) { return m.t + (1 - v / ymax) * (H - m.t - m.b); };
      var g = svgOpen(W, H), yt = ticksFor(ymax), i;
      for (i = 0; i <= yt; i++) {
        var v = ymax * i / yt, y = Y(v);
        g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '" stroke="var(--hr-grid)" stroke-width="1"/>';
        g += '<text x="' + (m.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(v) + "%</text>";
      }
      // Label every size that has room; the smallest gap is 50 MW.
      var every = (X(xs[1]) - X(xs[0])) < 30 ? 2 : 1;
      xs.forEach(function (v, k) { if (k % every === 0 || k === xs.length - 1) g += '<text x="' + X(v) + '" y="' + (H - m.b + 18) + '" text-anchor="middle">' + v + "</text>"; });
      g += '<text x="' + (W - m.r) + '" y="' + (H - 2) + '" text-anchor="end">project size, MW</text>';
      if (o) { var yo = Y(o.net); g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yo + '" y2="' + yo + '" stroke="var(--hr-ref)" stroke-width="1.5" stroke-dasharray="4 4"/>'; }
      var path = function (arr) { return arr.map(function (v, k) { return (k ? "L" : "M") + X(xs[k]).toFixed(1) + "," + Y(v).toFixed(1); }).join(""); };
      g += '<path d="' + path(s.behind) + '" fill="none" stroke="var(--hr-s2)" stroke-width="2" stroke-linejoin="round"/>';
      g += '<path d="' + path(s.shared) + '" fill="none" stroke="var(--hr-s1)" stroke-width="2" stroke-linejoin="round"/>';
      var li = xs.length - 1;
      g += '<circle cx="' + X(xs[li]) + '" cy="' + Y(s.behind[li]) + '" r="4" fill="var(--hr-s2)" stroke="var(--hr-bg)" stroke-width="2"/>';
      g += '<circle cx="' + X(xs[li]) + '" cy="' + Y(s.shared[li]) + '" r="4" fill="var(--hr-s1)" stroke="var(--hr-bg)" stroke-width="2"/>';
      g += '<line class="hr-xh" x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--hr-axis)" stroke-width="1" visibility="hidden"/>';
      g += '<rect x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '" fill="transparent"/></svg><div class="hr-tip" hidden></div>';
      box.innerHTML = g;
      var sv = box.querySelector("svg"), tip = box.querySelector(".hr-tip"), xh = box.querySelector(".hr-xh");
      sv.addEventListener("pointermove", function (ev) {
        var r = sv.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, k = 0, best = Infinity;
        xs.forEach(function (v, j) { var d = Math.abs(X(v) - px); if (d < best) { best = d; k = j; } });
        xh.setAttribute("x1", X(xs[k])); xh.setAttribute("x2", X(xs[k])); xh.setAttribute("visibility", "visible");
        tip.innerHTML = "<strong>" + xs[k] + " MW " + tech + "</strong><br>Sharing: " + s.shared[k].toFixed(1) + "% spilled<br>Behind existing farms: " + s.behind[k].toFixed(1) + "%" +
          (o ? "<br>Existing farms today: " + o.net.toFixed(1) + "%" : "");
        tip.hidden = false;
        var bx = box.getBoundingClientRect(), tx = X(xs[k]) * r.width / W;
        tip.style.left = Math.min(Math.max(0, tx + 12), bx.width - tip.offsetWidth) + "px";
        tip.style.top = "8px";
      });
      sv.addEventListener("pointerleave", function () { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
    }

    function rangeChart(p, box) {
      var rows = [["Generation", p.gen], ["Load", p.load]];
      var finite = [].concat(p.gen.q, p.load.q).filter(function (v) { return v != null; });
      var W = Math.max(300, box.clientWidth || 600), H = 128, m = { l: 84, r: 16, t: 10, b: 30 };
      var xmax = Math.max.apply(null, [100].concat(finite)) * 1.08;
      var step = [50, 100, 200, 250, 500, 1000, 2000].find(function (s) { return xmax / s <= (W < 480 ? 4 : 6); }) || 5000;
      var X = function (v) { return m.l + Math.min(v, xmax) / xmax * (W - m.l - m.r); };
      var g = svgOpen(W, H);
      for (var v = 0; v <= xmax; v += step) {
        g += '<line x1="' + X(v) + '" x2="' + X(v) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--hr-grid)" stroke-width="1"/>';
        g += '<text x="' + X(v) + '" y="' + (H - m.b + 16) + '" text-anchor="middle">' + v.toLocaleString() + "</text>";
      }
      g += '<text x="' + (W - m.r) + '" y="' + (H - 2) + '" text-anchor="end">headroom, MW</text>';
      rows.forEach(function (row, i) {
        var lab = row[0], d = row[1], cy = m.t + 22 + i * 38;
        g += '<text x="' + (m.l - 10) + '" y="' + (cy + 4) + '" text-anchor="end" style="fill:var(--hr-ink2);font-size:12.5px">' + lab + "</text>";
        if (d.q.every(function (v) { return v == null; })) { g += '<text x="' + (m.l + 4) + '" y="' + (cy + 4) + '">no network constraint active</text>'; return; }
        var at = function (k) { return X(d.q[k] == null ? xmax : d.q[k]); };
        g += '<line x1="' + at(0) + '" x2="' + at(4) + '" y1="' + cy + '" y2="' + cy + '" stroke="var(--hr-s1)" stroke-width="2"/>';
        g += '<rect x="' + at(1) + '" y="' + (cy - 8) + '" width="' + Math.max(2, at(3) - at(1)) + '" height="16" rx="4" fill="var(--hr-band)"/>';
        if (d.q[2] != null) g += '<line x1="' + X(d.q[2]) + '" x2="' + X(d.q[2]) + '" y1="' + (cy - 11) + '" y2="' + (cy + 11) + '" stroke="var(--hr-s1)" stroke-width="3" stroke-linecap="round"/>';
        if (d.q[4] == null) g += '<text x="' + (W - m.r) + '" y="' + (cy - 12) + '" text-anchor="end">some intervals: no limit</text>';
      });
      box.innerHTML = g + "</svg>";
    }

    function monthChart(p, box) {
      var W = Math.max(300, box.clientWidth || 600), H = 150, m = { l: 40, r: 10, t: 12, b: 26 };
      var vals = p.monthly.map(function (v) { return 100 * v; }), ymax = niceMax(Math.max.apply(null, [5].concat(vals)));
      var n = vals.length, bw = (W - m.l - m.r) / n;
      var Y = function (v) { return m.t + (1 - v / ymax) * (H - m.t - m.b); };
      var g = svgOpen(W, H), yt = ticksFor(ymax);
      for (var i = 0; i <= yt; i++) {
        var v = ymax * i / yt, y = Y(v);
        g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '" stroke="var(--hr-grid)" stroke-width="1"/>';
        g += '<text x="' + (m.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(v) + "%</text>";
      }
      var narrow = bw < 34;
      vals.forEach(function (v, k) {
        var x = m.l + k * bw + 2, w = Math.max(2, bw - 4), y = Y(v), h = Y(0) - y, r = Math.min(4, w / 2), lab = monthLabel(D.months[k]);
        if (h > 0.5) g += '<path d="M' + x + "," + Y(0) + " V" + (y + Math.min(4, h)) + " Q" + x + "," + y + " " + (x + r) + "," + y + " H" + (x + w - r) + " Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + Math.min(4, h)) + " V" + Y(0) +
          ' Z" fill="var(--hr-s1)"><title>' + lab + ": at the generation limit " + v.toFixed(1) + "% of intervals</title></path>";
        g += '<text x="' + (x + w / 2) + '" y="' + (H - m.b + 16) + '" text-anchor="middle">' + (narrow ? lab.charAt(0) : lab) + "</text>";
      });
      box.innerHTML = g + '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="var(--hr-axis)" stroke-width="1"/></svg>';
    }

    function showError(e) {
      $("detail").innerHTML = '<div class="hr-gate"><h4>' + (e.status === 429 ? "Taking a breather" : "Couldn't load this location") + "</h4><p>" + esc(e.message) + "</p></div>";
    }

    var tsCache = {};
    function loadSeries(id) {
      var key = id + "|" + state.step + "|" + (state.end || ""), box = $("c-ts");
      if (!box) return;
      var draw = function (r) { if (state.sel === id && $("c-ts")) { tsNav(r); tsChart(r, $("c-ts")); } };
      if (tsCache[key]) { draw(tsCache[key]); return; }
      box.innerHTML = '<div class="hr-status">Loading\u2026</div>';
      api.series(id, state.step, state.end).then(function (r) { tsCache[key] = r; draw(r); }, function (e) {
        if (state.sel !== id || !$("c-ts")) return;
        $("ts-nav").innerHTML = "";
        box.innerHTML = '<p class="hr-note">' + (e.status === 404 ? "No headroom history has been published for this location yet." : esc(e.message)) + "</p>";
      });
    }

    function shiftDate(iso, days) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
    function fmtDay(iso) { return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }

    function tsNav(r) {
      var nav = $("ts-nav"), win = { "5m": 1, "30m": 7, "1h": 31, "1d": 365 }[r.step];
      if (!win) { nav.innerHTML = '<span>' + fmtDay(r.start) + " to " + fmtDay(r.end) + "</span>"; return; }
      nav.innerHTML = '<button type="button" data-d="-1" aria-label="Earlier"' + (r.start <= r.first ? " disabled" : "") + '>\u2039 Earlier</button><span>' +
        (win === 1 ? fmtDay(r.start) : fmtDay(r.start) + " to " + fmtDay(r.end)) + '</span><button type="button" data-d="1" aria-label="Later"' + (r.end >= r.last ? " disabled" : "") + '>Later \u203a</button>' +
        '<button type="button" data-d="0"' + (r.end >= r.last ? " disabled" : "") + ">Latest</button>";
      nav.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          var d = +b.dataset.d;
          state.end = d === 0 ? null : shiftDate(r.end, d * win);
          loadSeries(r.id);
        });
      });
    }

    function tsChart(r, box) {
      var W = Math.max(300, box.clientWidth || 600), H = 260, m = { l: 48, r: 12, t: 22, b: 30 };
      var n = r.t.length, fine = r.step === "5m" || r.step === "30m" || r.step === "1h";
      var vals = [];
      r.total.concat(r.available).forEach(function (x) { if (x) vals.push(x[1], x[2]); });
      if (!vals.length) { box.innerHTML = '<p class="hr-note">No network limit applied here in this period.</p>'; return; }
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max.apply(null, vals);
      var span = (hi - lo) || 10, stepV = Math.pow(10, Math.floor(Math.log10(span / 4))), f = span / 4 / stepV;
      stepV *= f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
      var y0 = Math.floor(lo / stepV) * stepV, y1 = Math.ceil(hi / stepV) * stepV;
      var X = function (i) { return m.l + (n === 1 ? (W - m.l - m.r) / 2 : i / (n - 1) * (W - m.l - m.r)); };
      var Y = function (v) { return m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b); };
      var g = svgOpen(W, H);
      for (var v = y0; v <= y1 + 1e-9; v += stepV) {
        g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + (v === 0 ? "var(--hr-axis)" : "var(--hr-grid)") + '" stroke-width="1"/>';
        g += '<text x="' + (m.l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + Math.round(v).toLocaleString() + "</text>";
      }
      g += '<text x="' + m.l + '" y="10" text-anchor="start">MW</text>';
      var label = function (i) {
        var s = r.t[i];
        if (r.step === "5m" || r.step === "30m") return s.slice(11, 16);
        if (r.step === "1h") return new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
        if (r.step === "1y") return s.slice(0, 4);
        if (r.step === "3mo") return "Q" + (Math.floor((+s.slice(5, 7) - 1) / 3) + 1) + " " + s.slice(2, 4);
        if (r.step === "1mo" || r.step === "7d") return new Date(s + "T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
        return new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
      };
      var nt = Math.max(2, Math.min(7, Math.floor((W - m.l - m.r) / 80)));
      for (var k = 0; k < nt; k++) {
        var i = Math.round(k / (nt - 1) * (n - 1));
        g += '<text x="' + X(i) + '" y="' + (H - m.b + 18) + '" text-anchor="' + (k === 0 ? "start" : k === nt - 1 ? "end" : "middle") + '">' + label(i) + "</text>";
      }
      // min-max bands, then average lines; nulls break both
      var band = function (arr, color) {
        var out = "", seg = [];
        var flush = function () {
          if (seg.length > 1) out += '<path d="M' + seg.map(function (q) { return X(q[0]).toFixed(1) + "," + Y(q[2]).toFixed(1); }).join("L") + "L" +
            seg.slice().reverse().map(function (q) { return X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1); }).join("L") + 'Z" fill="' + color + '" fill-opacity=".16"/>';
          seg = [];
        };
        arr.forEach(function (x, i) { if (x) seg.push([i, x[1], x[2]]); else flush(); }); flush();
        return out;
      };
      var line = function (arr, color) {
        var d = "", pen = false;
        arr.forEach(function (x, i) { if (!x) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(x[0]).toFixed(1); pen = true; });
        return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>';
      };
      if (r.step !== "5m") g += band(r.total, "var(--hr-s2)") + band(r.available, "var(--hr-s1)");
      g += line(r.total, "var(--hr-s2)") + line(r.available, "var(--hr-s1)");
      g += '<line class="hr-xh" x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--hr-axis)" visibility="hidden"/>';
      g += '<rect x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '" fill="transparent"/></svg><div class="hr-tip" hidden></div>';
      box.innerHTML = g;
      var sv = box.querySelector("svg"), tip = box.querySelector(".hr-tip"), xh = box.querySelector(".hr-xh");
      var when = function (i) {
        var s = r.t[i];
        if (fine) return new Date(s + ":00").toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " (" + (r.step === "5m" ? "5 min" : r.step === "30m" ? "30 min" : "hour") + " ending)";
        if (r.step === "1y") return s.slice(0, 4);
        if (r.step === "3mo") return label(i).replace(" ", " 20");
        if (r.step === "1mo") return new Date(s + "T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" });
        if (r.step === "7d") return "Week from " + fmtDay(s);
        return fmtDay(s);
      };
      var fmt = function (x) { return x ? Math.round(x[0]).toLocaleString() + " MW" + (r.step === "5m" ? "" : " (" + x[1].toLocaleString() + "\u2013" + x[2].toLocaleString() + ")") : "no limit applied"; };
      sv.addEventListener("pointermove", function (ev) {
        var rc = sv.getBoundingClientRect(), px = (ev.clientX - rc.left) * W / rc.width;
        var i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (W - m.l - m.r) * (n - 1))));
        xh.setAttribute("x1", X(i)); xh.setAttribute("x2", X(i)); xh.setAttribute("visibility", "visible");
        tip.innerHTML = "<strong>" + when(i) + "</strong><br>Total " + fmt(r.total[i]) + "<br>Available " + fmt(r.available[i]);
        tip.hidden = false;
        var bx = box.getBoundingClientRect(), tx = X(i) * rc.width / W;
        tip.style.left = Math.min(Math.max(0, tx + 12), bx.width - tip.offsetWidth) + "px";
        tip.style.top = "4px";
      });
      sv.addEventListener("pointerleave", function () { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
    }

    function renderDetail() {
      var id = state.sel; if (!byId.has(id)) return;
      var p = details.get(id);
      if (!p) {
        $("detail").innerHTML = '<div class="hr-status">Loading ' + esc(nameOf(byId.get(id))) + "\u2026</div>";
        api.point(id).then(function (r) { details.set(id, r.point); if (state.sel === id) renderDetail(); },
          function (e) { if (state.sel === id) showError(e); });
        return;
      }
      var st = status(p.gen.at || 0), size = D.sizes[state.sizeIdx];
      var spillStat = function (t, s) {
        return s ? '<div class="hr-stat"><span class="hr-l">New ' + size + " MW " + t + ' farm: output spilled</span><span class="hr-v hr-num">' + s.shared[state.sizeIdx].toFixed(1) +
          '%</span><span class="hr-f">sharing with existing farms; ' + s.behind[state.sizeIdx].toFixed(1) + "% if behind them · " + (s.src === "local" ? "local" : "regional") + " output pattern</span></div>" : "";
      };
      var obsText = ["solar", "wind"].filter(function (t) { return p.obs[t]; }).map(function (t) {
        var o = p.obs[t];
        return t + " " + o.net.toFixed(1) + "%" + (o.farm >= 0.05 ? ' <span style="font-size:.8rem;font-weight:400">+ ' + o.farm.toFixed(1) + "% farm caps</span>" : "");
      }).join(", ");
      var anyFarm = ["solar", "wind"].some(function (t) { return p.obs[t] && p.obs[t].farm >= 0.05; });
      var con = function (title, c, dir) {
        return c ? '<div class="hr-con"><div class="hr-h"><strong>' + title + '</strong><span class="hr-mono">' + esc(c.id) + "</span><span>at the limit in " + c.n.toLocaleString() + ' intervals</span></div><div class="hr-d">' +
          (esc(c.d) || '<span class="hr-muted">No description published</span>') + "</div></div>"
          : '<div class="hr-con"><div class="hr-h"><strong>' + title + '</strong></div><div class="hr-d hr-muted">No network constraint limited ' + dir + " here.</div></div>";
      };
      var tech = state.tech, s = p.spill[tech];
      $("detail").innerHTML =
        '<div class="hr-dhead"><h3>' + esc(nameOf(p)) + "</h3>" +
        '<div class="hr-ids"><span class="hr-mono">' + esc(p.id) + "</span><span>" + (REG[p.region] || esc(p.region)) + "</span><span>" + esc(p.type.toLowerCase()) +
        '</span><span>units: <span class="hr-mono">' + esc(p.duids.join(", ")) + "</span></span></div>" +
        '<span class="hr-pill">' + statusIcon(st[0]) + st[1] + "</span></div>" +
        '<div class="hr-mine"><div class="hr-bhead"><h5>Your notes</h5><button type="button" class="hr-btn' + (saved[p.id] ? " hr-quiet" : "") + '" data-hr="star" aria-pressed="' + !!saved[p.id] + '">' +
        (saved[p.id] ? "\u2605 Saved" : "\u2606 Save location") + "</button></div>" +
        '<textarea data-hr="note" maxlength="2000" placeholder="Private notes on this location \u2013 only you can see these">' + esc(saved[p.id] ? saved[p.id].note : "") + "</textarea>" +
        '<div class="hr-actions"><button type="button" class="hr-btn hr-quiet" data-hr="save-note">Save note</button><span class="hr-msg" data-hr="note-msg" aria-live="polite"></span></div></div>' +
        '<div class="hr-stats">' +
        '<div class="hr-stat"><span class="hr-l">Time at the generation limit</span><span class="hr-v hr-num">' + fmtPct(p.gen.at) + '</span><span class="hr-f">of five-minute intervals</span></div>' +
        '<div class="hr-stat"><span class="hr-l">Median generation headroom</span><span class="hr-v hr-num">' + fmtMW(p.gen.q[2]) + '</span><span class="hr-f">P10 ' + fmtMW(p.gen.q[0]) + " · P90 " + fmtMW(p.gen.q[4]) + "</span></div>" +
        spillStat("solar", p.spill.solar) + spillStat("wind", p.spill.wind) +
        (obsText ? '<div class="hr-stat"><span class="hr-l">Existing farms here lost to network limits</span><span class="hr-v hr-num" style="font-size:1.1rem">' + obsText + '</span><span class="hr-f">observed, not modelled' + (anyFarm ? "; farm caps are limits AEMO placed on those particular farms, which a new project wouldn't inherit" : "") + '</span></div>' : "") +
        "</div>" +
        '<div class="hr-block"><div class="hr-bhead"><h5>Spill for a new project</h5>' +
        '<div class="hr-seg" role="group" aria-label="Technology"><button type="button" data-t="solar" aria-pressed="' + (tech === "solar") + '">Solar</button><button type="button" data-t="wind" aria-pressed="' + (tech === "wind") + '">Wind</button></div></div>' +
        '<div class="hr-legend"><span><svg width="18" height="4" aria-hidden="true"><rect width="18" height="3" y="0.5" rx="1.5" fill="var(--hr-s1)"/></svg>Sharing with existing farms</span>' +
        '<span><svg width="18" height="4" aria-hidden="true"><rect width="18" height="3" y="0.5" rx="1.5" fill="var(--hr-s2)"/></svg>Behind existing farms</span>' +
        (p.obs[tech] ? '<span><svg width="18" height="4" aria-hidden="true"><line x1="0" x2="18" y1="2" y2="2" stroke="var(--hr-ref)" stroke-width="1.5" stroke-dasharray="4 3"/></svg>Existing ' + tech + " farms today</span>" : "") +
        '</div><div class="hr-chart" data-hr="c-spill"></div>' +
        '<details><summary>Show as a table</summary><div class="hr-dt">' +
        (s ? '<table class="hr-t"><thead><tr><th>Size</th><th class="hr-r">Sharing</th><th class="hr-r">Behind existing farms</th></tr></thead><tbody>' +
          D.sizes.map(function (z, i) { return '<tr><td class="hr-num">' + z + ' MW</td><td class="hr-r hr-num">' + s.shared[i].toFixed(1) + '%</td><td class="hr-r hr-num">' + s.behind[i].toFixed(1) + "%</td></tr>"; }).join("") + "</tbody></table>" : "") +
        "</div></details></div>" +
        '<div class="hr-block"><div class="hr-bhead"><h5>Headroom range, P10 to P90</h5><span class="hr-note">box P25 to P75, tick at the median</span></div><div class="hr-chart" data-hr="c-range"></div></div>' +
        '<div class="hr-block"><div class="hr-bhead"><h5>Headroom over time</h5></div>' +
        '<div class="hr-steps-scroll"><div class="hr-seg" role="group" aria-label="Time step" data-hr="steps">' +
        STEPS.map(function (s) { return '<button type="button" data-s="' + s[0] + '" aria-pressed="' + (state.step === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</div></div>" +
        '<div class="hr-nav" data-hr="ts-nav"></div>' +
        '<div class="hr-legend"><span><svg width="18" height="4" aria-hidden="true"><rect width="18" height="3" y="0.5" rx="1.5" fill="var(--hr-s2)"/></svg>Total headroom (the ceiling)</span>' +
        '<span><svg width="18" height="4" aria-hidden="true"><rect width="18" height="3" y="0.5" rx="1.5" fill="var(--hr-s1)"/></svg>Available headroom (spare room)</span>' +
        '<span><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" rx="2" fill="var(--hr-s1)" fill-opacity=".18"/></svg>Shading: lowest to highest in each step</span></div>' +
        '<div class="hr-chart" data-hr="c-ts"></div>' +
        '<p class="hr-note">Total is the most the network could have taken from this connection point: what the farms here were sending out, plus the spare room. Available is that spare room. Each point is the average over the step. Gaps are times when no network limit applied here.</p></div>' +
        '<div class="hr-block"><div class="hr-bhead"><h5>Time at the generation limit, by month</h5></div><div class="hr-chart" data-hr="c-month"></div></div>' +
        '<div class="hr-block"><h5>What limits this location</h5><div class="hr-cons">' + con("Generation", p.topGen, "generation") + con("Load", p.topLoad, "load") + "</div>" +
        '<p class="hr-note">AEMO\'s own description of the constraint most often at its limit for this connection point. "O/L" means overload; "on trip of" names the outage the limit protects against.</p></div>';
      $("detail").querySelectorAll(".hr-seg button").forEach(function (b) {
        b.addEventListener("click", function () { state.tech = b.dataset.t; renderDetail(); });
      });
      $("star").addEventListener("click", function () {
        var next = Object.assign({}, saved);
        if (next[p.id]) delete next[p.id]; else next[p.id] = { note: $("note").value.trim(), t: new Date().toISOString() };
        persist(next, "star");
      });
      $("save-note").addEventListener("click", function () {
        var next = Object.assign({}, saved), note = $("note").value.trim();
        next[p.id] = { note: note, t: new Date().toISOString() };
        persist(next, "note");
      });
      spillChart(p, tech, $("c-spill"));
      rangeChart(p, $("c-range"));
      monthChart(p, $("c-month"));
      $("steps").addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        state.step = b.dataset.s;
        $("steps").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        loadSeries(p.id);
      });
      loadSeries(p.id);
    }

    // Saved locations are one encrypted record per subscriber.
    function persist(next, what) {
      var msg = $("note-msg");
      root.querySelectorAll('[data-hr="star"],[data-hr="save-note"]').forEach(function (b) { b.disabled = true; });
      if (msg) msg.textContent = "Saving\u2026";
      api.save("locations", next).then(function () {
        saved = next; renderChips(); renderList(); renderDetail();
        var m = $("note-msg"); if (m) m.textContent = what === "note" ? "Note saved." : saved[state.sel] ? "Location saved." : "Removed from saved.";
      }, function (e) {
        root.querySelectorAll('[data-hr="star"],[data-hr="save-note"]').forEach(function (b) { b.disabled = false; });
        if (msg) msg.textContent = "Couldn't save: " + e.message;
      });
    }

    // Delete everything, with the confirmation step on the page itself.
    $("privacy").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.hr === "wipe") {
        $("privacy").innerHTML = "Delete all your saved locations and notes? This can't be undone. " +
          '<button type="button" class="hr-link" data-hr="wipe-yes">Yes, delete everything</button> \u00b7 <button type="button" class="hr-link" data-hr="wipe-no">Cancel</button>';
      } else if (b.dataset.hr === "wipe-yes") {
        api.wipe().then(function () {
          saved = {}; renderChips(); renderList(); renderDetail();
          $("privacy").textContent = "Everything you'd saved has been deleted.";
        }, function (err) { $("privacy").textContent = "Couldn't delete: " + err.message; });
      } else if (b.dataset.hr === "wipe-no") {
        $("privacy").innerHTML = "Locations you save and your notes are stored encrypted and only you can see them. <button type=\"button\" class=\"hr-link\" data-hr=\"wipe\">Delete everything I've saved</button>";
      }
    });

    // Redraw charts when the widget's own width changes (window resize, or the
    // theme changing its content column), not on every window resize.
    var lastW = root.clientWidth, rt;
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (Math.abs(root.clientWidth - lastW) < 2) return;
        lastW = root.clientWidth; clearTimeout(rt); rt = setTimeout(renderDetail, 120);
      }).observe(root);
    }

    var start = decodeURIComponent((location.hash || "").slice(1));
    var dflt = root.dataset.default;
    state.sel = byId.has(start) ? start : byId.has(dflt) ? dflt : D.points.slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); })[0].id;
    renderList(); renderDetail();
    var selRow = root.querySelector('.hr-row[aria-selected="true"]'), wrap = root.querySelector(".hr-tablewrap");
    if (selRow && wrap) wrap.scrollTop = Math.max(0, selRow.offsetTop - wrap.clientHeight / 2);
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-headroom-explorer], .pshr"), initWidget);
})();
