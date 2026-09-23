// PowerSocket Global Electrification Tracker widget, for the Ghost page.
// Embed with (see electrification-page.html):
//   <div class="pselec" data-api="..." data-countries='[...]' data-sectors='[...]'></div>
//   <script src="https://cdn.jsdelivr.net/gh/OWNER/REPO@main/electrification-widget.js"></script>
//
// Unlike widget.js (NEM/ERCOT live 5-min feeds), this calls a private API
// that returns one country/sector's year series at a time -- there's no
// bulk-data endpoint for this page to fetch from.
//
// Layout: headline share per country, a by-sector comparison (tap a row),
// that sector's trend for every country on one chart, then sources and
// definitions behind "About this data". Styles are injected here rather than
// in the page snippet, so layout changes don't need a re-paste in Ghost.
(function () {
  var DEFAULT_COUNTRIES = [
    { key: "AU", label: "Australia" },
    { key: "US", label: "United States" }
  ];
  var DEFAULT_SECTORS = [
    { key: "Whole economy", label: "Whole economy" },
    { key: "Industry", label: "Industry" },
    { key: "Residential buildings", label: "Residential" },
    { key: "Commercial/services", label: "Commercial/services" },
    { key: "Transport", label: "Transport" }
  ];
  // Categorical slots 1-4 (blue, orange, aqua, yellow), validated for CVD
  // separation on white and on the site's dark background (aqua and yellow are
  // under 3:1 on white, so values are always labelled and a table is offered).
  // A country keeps its slot whatever else is shown.
  var SERIES = {
    light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
    dark: ["#3987e5", "#d95926", "#199e70", "#c98500"]
  };
  var SLOT = { AU: 0, US: 1, CN: 2, IN: 3 };
  var TREND_YEARS = 10;

  var CSS = [
    ".ps2{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.45;color:var(--ps2-ink);",
    "  --ps2-ink:#0b0b0b;--ps2-ink2:#52514e;--ps2-muted:#6e6c66;--ps2-grid:#e1e0d9;--ps2-line:#c3c2b7;",
    "  --ps2-wash:rgba(11,11,11,.05);--ps2-ring:rgba(11,11,11,.12);--ps2-up:#006300;--ps2-down:#b42323;--ps2-note:#a86b00}",
    ".ps2.ps2-dark{--ps2-ink:#fff;--ps2-ink2:#c3c2b7;--ps2-muted:#9a988f;--ps2-grid:#2c2c2a;--ps2-line:#44443f;",
    "  --ps2-wash:rgba(255,255,255,.06);--ps2-ring:rgba(255,255,255,.14);--ps2-up:#3cc13c;--ps2-down:#f07b7b;--ps2-note:#e0a526}",
    ".ps2 *{box-sizing:border-box}",
    ".ps2-lede{margin:0 0 1rem;font-size:.95rem;color:var(--ps2-ink2)}",
    ".ps2-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-bottom:2rem}",
    ".ps2-kpi{padding:.9rem 1rem;border:1px solid var(--ps2-ring);border-radius:10px}",
    ".ps2-kpi-name{display:flex;align-items:center;gap:.45rem;font-size:.9rem;color:var(--ps2-ink2)}",
    ".ps2-dot{width:10px;height:10px;border-radius:50%;flex:none}",
    ".ps2-kpi-value{font-size:2.4rem;font-weight:600;line-height:1.1;margin:.35rem 0 .1rem;letter-spacing:-.01em}",
    ".ps2-kpi-sub{font-size:.8rem;color:var(--ps2-muted)}",
    ".ps2-kpi-delta{font-size:.85rem;margin-top:.35rem;color:var(--ps2-ink2)}",
    ".ps2-kpi-delta b{font-weight:600}",
    ".ps2-up{color:var(--ps2-up)}.ps2-down{color:var(--ps2-down)}",
    ".ps2-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.25rem 1rem;margin:0 0 .6rem}",
    ".ps2-h{margin:0;font-family:inherit;font-size:1.05rem;font-weight:600;line-height:1.3;letter-spacing:0;color:var(--ps2-ink)}",
    ".ps2-legend{display:flex;gap:1rem;font-size:.8rem;color:var(--ps2-ink2)}",
    ".ps2-legend span{display:inline-flex;align-items:center;gap:.35rem}",
    ".ps2-key-rect{width:12px;height:8px;border-radius:2px}",
    ".ps2-key-line{width:14px;height:2px;border-radius:1px}",
    ".ps2-rows{display:flex;flex-direction:column;gap:2px;margin-bottom:.4rem}",
    ".ps2-row{all:unset;box-sizing:border-box;display:block;width:100%;padding:.55rem .6rem;border-radius:8px;cursor:pointer;color:inherit;font:inherit}",
    ".ps2-row:hover{background:var(--ps2-wash)}",
    ".ps2-row:focus-visible{outline:2px solid var(--ps2-ink2);outline-offset:1px}",
    ".ps2-row[aria-pressed=true]{background:var(--ps2-wash);box-shadow:inset 3px 0 0 var(--ps2-ink2)}",
    ".ps2-row-label{display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:.3rem}",
    ".ps2-row-label .ps2-go{color:var(--ps2-muted);font-size:.8rem}",
    ".ps2-bar-line{display:flex;align-items:center;gap:.5rem;min-height:14px;margin-top:3px}",
    ".ps2-bar-track{flex:1;position:relative;height:10px}",
    ".ps2-bar{position:absolute;left:0;top:0;height:10px;border-radius:0 4px 4px 0;min-width:2px}",
    ".ps2-bar-val{position:absolute;top:50%;transform:translateY(-50%);padding-left:6px;font-size:.8rem;white-space:nowrap;color:var(--ps2-ink2);font-variant-numeric:tabular-nums}",
    ".ps2-na{font-size:.8rem;color:var(--ps2-muted)}",
    ".ps2-hint{font-size:.8rem;color:var(--ps2-muted);margin:0 0 2rem}",
    ".ps2-chart{width:100%;height:300px;transition:opacity .15s}",
    ".ps2-notes{margin-top:.5rem}",
    ".ps2-note{font-size:.85rem;margin-top:.5rem;padding:.5rem .75rem;border-left:3px solid var(--ps2-note);background:var(--ps2-wash);border-radius:0 6px 6px 0;color:var(--ps2-ink)}",
    ".ps2-tools{margin-top:.5rem}",
    ".ps2-link{all:unset;cursor:pointer;font-size:.8rem;color:var(--ps2-ink2);text-decoration:underline;text-underline-offset:3px}",
    ".ps2-link:focus-visible{outline:2px solid var(--ps2-ink2)}",
    ".ps2-table-wrap{overflow-x:auto;margin-top:.5rem}",
    ".ps2-table{border-collapse:collapse;font-size:.85rem;font-variant-numeric:tabular-nums;min-width:260px}",
    ".ps2-table th,.ps2-table td{padding:.3rem .9rem .3rem 0;text-align:right;border-bottom:1px solid var(--ps2-grid)}",
    ".ps2-table th:first-child,.ps2-table td:first-child{text-align:left}",
    ".ps2-table th{font-weight:600;color:var(--ps2-ink2)}",
    ".ps2-about{margin-top:2rem;border-top:1px solid var(--ps2-grid);padding-top:.75rem;font-size:.85rem;color:var(--ps2-ink2)}",
    ".ps2-about summary{cursor:pointer;font-weight:600;color:var(--ps2-ink)}",
    ".ps2-about p{margin:.6rem 0}",
    ".ps2-status{padding:2rem 0;text-align:center;color:var(--ps2-muted)}"
  ].join("\n");

  function injectStyles() {
    if (document.getElementById("ps2-styles")) return;
    var style = document.createElement("style");
    style.id = "ps2-styles";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // decimals: what the source supports (the IEA publishes China in whole percentages).
  function pct(v, decimals) {
    if (v === null || v === undefined) return "–";
    return v.toFixed(decimals === undefined ? 1 : decimals) + "%";
  }

  // Light or dark from the text colour the site gives us, so it follows the
  // Ghost theme toggle as well as the OS setting.
  function isDark(node) {
    var m = getComputedStyle(node).color.match(/\d+(\.\d+)?/g);
    if (!m) return false;
    var lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    return lum > 0.6;
  }

  function pageBackground(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
      var bg = getComputedStyle(n).backgroundColor;
      if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
    }
    return "#ffffff";
  }

  function niceMax(v) {
    var steps = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
    for (var i = 0; i < steps.length; i++) if (v * 1.15 <= steps[i]) return steps[i];
    return 100;
  }

  function initWidget(root) {
    if (!root.dataset.api) return;
    injectStyles();
    var api = root.dataset.api;
    var COUNTRIES = DEFAULT_COUNTRIES, SECTORS = DEFAULT_SECTORS;
    try { if (root.dataset.countries) COUNTRIES = JSON.parse(root.dataset.countries); } catch (e) { /* default */ }
    try { if (root.dataset.sectors) SECTORS = JSON.parse(root.dataset.sectors); } catch (e) { /* default */ }

    var state = { sector: SECTORS[0].key, data: {}, showTable: false };
    var ui = el("div", "ps2");
    root.textContent = "";
    root.appendChild(ui);
    ui.appendChild(el("div", "ps2-status", "Loading electrification data…"));

    function colors() {
      return SERIES[ui.classList.contains("ps2-dark") ? "dark" : "light"];
    }
    function applyTheme() {
      ui.classList.toggle("ps2-dark", isDark(root));
    }
    applyTheme();

    function fetchSeries(country, sector) {
      var url = api + "?country=" + encodeURIComponent(country) + "&sector=" + encodeURIComponent(sector);
      return fetch(url, { cache: "no-store" })
        .then(function (resp) { if (!resp.ok) throw new Error("status " + resp.status); return resp.json(); })
        .catch(function () { return null; });
    }

    function get(country, sector) {
      return state.data[country + "|" + sector];
    }

    function hasSeries(d) {
      return d && !d.withheld && d.years && d.years.length;
    }

    // A country with a whole-economy series but no sector data at all.
    function economyOnly(c) {
      return hasSeries(get(c.key, "Whole economy")) && SECTORS.every(function (s) {
        var d = get(c.key, s.key);
        return s.key === "Whole economy" || (!hasSeries(d) && !(d && d.withheld));
      });
    }

    function slot(c, i) {
      return c.key in SLOT ? SLOT[c.key] : i % SERIES.light.length;
    }
    function dec(c) {
      return c.decimals === undefined ? 1 : c.decimals;
    }

    // The API lists the published countries, so adding one needs no change to
    // the page snippet; data-countries is only a fallback.
    fetch(api + "?list=countries", { cache: "no-store" })
      .then(function (resp) { return resp.ok ? resp.json() : null; })
      .catch(function () { return null; })
      .then(function (list) {
        if (list && list.countries && list.countries.length) COUNTRIES = list.countries;
        var jobs = [];
        COUNTRIES.forEach(function (c) {
          SECTORS.forEach(function (s) {
            jobs.push(fetchSeries(c.key, s.key).then(function (d) { state.data[c.key + "|" + s.key] = d; }));
          });
        });
        return Promise.all(jobs);
      })
      .then(function () {
      var any = Object.keys(state.data).some(function (k) { return hasSeries(state.data[k]); });
      if (!any) {
        ui.textContent = "";
        ui.appendChild(el("div", "ps2-status", "Electrification data is unavailable right now."));
        return;
      }
      build();
    });

    var chartEl, trendTitle, notesEl, tableWrap, tableBtn, rowsEl, sourcesEl;

    function build() {
      ui.textContent = "";
      ui.appendChild(el("p", "ps2-lede",
        "How much of each country's final energy use comes from electricity, the IEA's measure of electrification."));

      // Headline: whole-economy share per country.
      var kpis = el("div", "ps2-kpis");
      COUNTRIES.forEach(function (c, i) {
        var d = get(c.key, "Whole economy");
        var tile = el("div", "ps2-kpi");
        var name = el("div", "ps2-kpi-name");
        var dot = el("span", "ps2-dot");
        dot.dataset.series = slot(c, i);
        name.appendChild(dot);
        name.appendChild(el("span", "", c.label));
        tile.appendChild(name);
        if (hasSeries(d)) {
          var n = d.years.length, latest = d.electrification_rate[n - 1], year = d.years[n - 1];
          tile.appendChild(el("div", "ps2-kpi-value", pct(latest, dec(c))));
          tile.appendChild(el("div", "ps2-kpi-sub", "of final energy use, " + year));
          // Change over the last TREND_YEARS, or since the series starts if it's shorter.
          var j = d.years.indexOf(year - TREND_YEARS);
          if (j < 0 && n > 1) j = 0;
          if (j >= 0) {
            var delta = latest - d.electrification_rate[j];
            var line = el("div", "ps2-kpi-delta");
            var arrow = el("b", Math.abs(delta) < 0.05 ? "" : delta > 0 ? "ps2-up" : "ps2-down",
              (Math.abs(delta) < 0.05 ? "No change" : (delta > 0 ? "▲ +" : "▼ ") + delta.toFixed(dec(c)) + " pts"));
            line.appendChild(arrow);
            line.appendChild(document.createTextNode(" since " + d.years[j]));
            tile.appendChild(line);
          }
        } else {
          tile.appendChild(el("div", "ps2-kpi-sub", "Not available"));
        }
        kpis.appendChild(tile);
      });
      ui.appendChild(kpis);

      // By sector: latest share, every country, one 0-100% scale.
      var latestYear = 0;
      Object.keys(state.data).forEach(function (k) {
        var d = state.data[k];
        if (hasSeries(d)) latestYear = Math.max(latestYear, d.updated_through || d.years[d.years.length - 1]);
      });
      var head = el("div", "ps2-head");
      head.appendChild(el("h3", "ps2-h", "By sector, " + latestYear));
      head.appendChild(legend("rect"));
      ui.appendChild(head);
      rowsEl = el("div", "ps2-rows");
      SECTORS.forEach(function (s) {
        var row = el("button", "ps2-row");
        row.type = "button";
        row.dataset.sector = s.key;
        var label = el("div", "ps2-row-label");
        var caveat = COUNTRIES.some(function (c) { var d = get(c.key, s.key); return d && d.caveat; });
        label.appendChild(el("span", "", s.label + (caveat ? " *" : "")));
        label.appendChild(el("span", "ps2-go", "Trend ›"));
        row.appendChild(label);
        COUNTRIES.forEach(function (c, i) {
          var d = get(c.key, s.key);
          if (!hasSeries(d) && !(d && d.withheld) && economyOnly(c)) return;  // said once, below the rows
          var line = el("div", "ps2-bar-line");
          var track = el("div", "ps2-bar-track");
          if (hasSeries(d)) {
            var v = d.electrification_rate[d.electrification_rate.length - 1];
            var bar = el("div", "ps2-bar");
            bar.dataset.series = slot(c, i);
            bar.style.width = Math.max(0, Math.min(100, v)) + "%";
            var val = el("span", "ps2-bar-val", pct(v, dec(c)));
            val.style.left = Math.max(0, Math.min(100, v)) + "%";
            track.appendChild(bar);
            track.appendChild(val);
            line.appendChild(track);
          } else {
            line.appendChild(el("span", "ps2-na", c.label + ": " + (d && d.withheld ? "not published" : "no data")));
          }
          row.appendChild(line);
        });
        row.addEventListener("click", function () {
          state.sector = s.key;
          state.showTable = false;
          renderTrend();
          if (chartEl.getBoundingClientRect().top > window.innerHeight * 0.8) {
            trendTitle.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
        rowsEl.appendChild(row);
      });
      ui.appendChild(rowsEl);
      var anyCaveat = SECTORS.some(function (s) {
        return COUNTRIES.some(function (c) { var d = get(c.key, s.key); return d && d.caveat; });
      });
      var onlyEconomy = COUNTRIES.filter(economyOnly).map(function (c) { return c.label; });
      ui.appendChild(el("p", "ps2-hint", "Tap a sector to see its trend." +
        (anyCaveat ? " * Read the note under its trend." : "") +
        (onlyEconomy.length ? " " + onlyEconomy.join(" and ") + ": whole economy only, as no open data splits " +
          (onlyEconomy.length > 1 ? "their" : "its") + " energy use by sector." : "")));

      // Trend for the selected sector.
      var thead = el("div", "ps2-head");
      trendTitle = el("h3", "ps2-h");
      thead.appendChild(trendTitle);
      thead.appendChild(legend("line"));
      ui.appendChild(thead);
      chartEl = el("div", "ps2-chart");
      chartEl.setAttribute("role", "img");
      ui.appendChild(chartEl);
      notesEl = el("div", "ps2-notes");
      ui.appendChild(notesEl);
      var tools = el("div", "ps2-tools");
      tableBtn = el("button", "ps2-link");
      tableBtn.type = "button";
      tableBtn.addEventListener("click", function () { state.showTable = !state.showTable; renderTable(); });
      tools.appendChild(tableBtn);
      ui.appendChild(tools);
      tableWrap = el("div", "ps2-table-wrap");
      ui.appendChild(tableWrap);

      // Sources and definitions, out of the way until asked for.
      var about = el("details", "ps2-about");
      about.appendChild(el("summary", "", "About this data"));
      about.appendChild(el("p", "",
        "Electrification here is electricity's share of final energy consumption, on the IEA definition: " +
        "energy used by homes, businesses, industry and transport. Fuel burned to generate electricity, the " +
        "energy industry's own use, international aviation and shipping, and non-energy uses such as " +
        "chemical feedstocks are excluded."));
      sourcesEl = el("div");
      about.appendChild(sourcesEl);
      about.appendChild(el("p", "",
        "US figures still include international aviation and shipping fuel, which the EIA doesn't publish " +
        "separately; this lowers the US rate slightly. India's figures are fiscal years (April to March), " +
        "labelled by the year they start in. Every figure is compared with independent sources before " +
        "it's published, and the data refreshes twice a year."));
      ui.appendChild(about);

      paint();
      renderTrend();
    }

    function legend(kind) {
      var box = el("div", "ps2-legend");
      COUNTRIES.forEach(function (c, i) {
        var item = el("span");
        var key = el("span", kind === "rect" ? "ps2-key-rect" : "ps2-key-line");
        key.dataset.series = slot(c, i);
        item.appendChild(key);
        item.appendChild(document.createTextNode(c.label));
        box.appendChild(item);
      });
      return box;
    }

    // Series colours live on data-series attributes so a theme change is one repaint.
    function paint() {
      var cols = colors();
      Array.prototype.forEach.call(ui.querySelectorAll("[data-series]"), function (n) {
        n.style.background = cols[+n.dataset.series];
      });
    }

    function sectorLabel(key) {
      for (var i = 0; i < SECTORS.length; i++) if (SECTORS[i].key === key) return SECTORS[i].label;
      return key;
    }

    function renderTrend() {
      Array.prototype.forEach.call(rowsEl.children, function (r) {
        r.setAttribute("aria-pressed", r.dataset.sector === state.sector ? "true" : "false");
      });
      trendTitle.textContent = sectorLabel(state.sector) + " over time";
      var cols = colors();
      var dark = ui.classList.contains("ps2-dark");
      var ink2 = dark ? "#c3c2b7" : "#52514e", muted = dark ? "#9a988f" : "#6e6c66";
      var grid = dark ? "#2c2c2a" : "#e1e0d9", axis = dark ? "#44443f" : "#c3c2b7";
      var surface = pageBackground(root);

      var traces = [], maxV = 0, ends = [], firstYear = Infinity, lastYear = -Infinity;
      COUNTRIES.forEach(function (c, i) {
        var d = get(c.key, state.sector);
        if (!hasSeries(d)) return;
        var n = d.years.length;
        firstYear = Math.min(firstYear, d.years[0]);
        lastYear = Math.max(lastYear, d.years[n - 1]);
        d.electrification_rate.forEach(function (v) { if (v !== null && v > maxV) maxV = v; });
        var sizes = d.years.map(function (_, k) { return k === n - 1 ? 9 : 0; });
        var col = cols[slot(c, i)];
        traces.push({
          x: d.years, y: d.electrification_rate, name: c.label, type: "scatter", mode: "lines+markers",
          line: { width: 2, color: col, shape: "linear" },
          marker: { size: sizes, color: col, line: { width: 2, color: surface } },
          hovertemplate: "%{y:." + dec(c) + "f}%<extra>" + c.label + "</extra>"
        });
        ends.push({ x: d.years[n - 1], y: d.electrification_rate[n - 1], decimals: dec(c) });
      });

      var ymax = niceMax(maxV), height = 300, margin = { t: 12, r: 64, b: 32, l: 44 };
      // A value label at every line end (with four series they're how colour
      // isn't the only cue). Labels that would overlap are spread apart and
      // tied back to their line with a thin leader line.
      var plotH = height - margin.t - margin.b, GAP = 15;
      var labels = ends.map(function (e) {
        var y = margin.t + plotH * (1 - e.y / ymax);
        return { e: e, at: y, y: y };
      }).sort(function (a, b) { return a.at - b.at; });
      for (var k = 1; k < labels.length; k++) {
        if (labels[k].y - labels[k - 1].y < GAP) labels[k].y = labels[k - 1].y + GAP;
      }
      var overflow = labels.length ? labels[labels.length - 1].y - (margin.t + plotH) : 0;
      if (overflow > 0) labels.forEach(function (l) { l.y -= overflow; });
      var annotations = labels.map(function (l) {
        var moved = Math.abs(l.y - l.at) > 1;
        return {
          x: l.e.x, y: l.e.y, text: pct(l.e.y, l.e.decimals), xanchor: "left", font: { size: 12, color: ink2 },
          showarrow: moved, ax: moved ? 20 : 0, ay: moved ? l.y - l.at : 0, xshift: moved ? 0 : 8,
          arrowhead: 0, arrowwidth: 1, arrowcolor: axis, standoff: 5
        };
      });

      chartEl.setAttribute("aria-label", trendTitle.textContent + ", electricity share of final energy by year. " +
        "A data table is available below the chart.");
      Plotly.react(chartEl, traces, {
        height: height, margin: margin,
        paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
        font: { family: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", size: 12, color: muted },
        showlegend: false, hovermode: "x unified",
        hoverlabel: { bgcolor: surface, bordercolor: axis, font: { color: dark ? "#fff" : "#0b0b0b", size: 13 } },
        // Pinned: otherwise Plotly widens the range to fit the end labels.
        xaxis: { range: [firstYear - 0.5, lastYear + 0.5], tickformat: "d", gridcolor: grid, linecolor: axis, showline: true, zeroline: false,
                 fixedrange: true, ticks: "", showspikes: true, spikemode: "across", spikethickness: -1,
                 spikecolor: axis, spikedash: "solid" },
        yaxis: { range: [0, ymax], ticksuffix: "%", gridcolor: grid, zeroline: false, fixedrange: true,
                 rangemode: "tozero" },
        annotations: annotations
      }, { responsive: true, displayModeBar: false });

      renderNotes();
      renderTable();
      renderSources();
    }

    function renderNotes() {
      notesEl.textContent = "";
      COUNTRIES.forEach(function (c) {
        var d = get(c.key, state.sector);
        if (d && d.withheld) notesEl.appendChild(el("div", "ps2-note", c.label + " not published: " + d.reason));
        else if (d && d.caveat) notesEl.appendChild(el("div", "ps2-note", c.label + ": " + d.caveat));
        else if (!hasSeries(d) && hasSeries(get(c.key, "Whole economy"))) {
          notesEl.appendChild(el("div", "ps2-note", c.label + ": no open data for this sector; see Whole economy."));
        }
      });
      if (state.sector === "Transport" && COUNTRIES.some(function (c) { return c.key === "US"; })) {
        notesEl.appendChild(el("div", "ps2-note",
          "United States: the EIA counts home EV charging as residential electricity, so US transport understates EV uptake."));
      }
    }

    function renderTable() {
      tableBtn.textContent = state.showTable ? "Hide data table" : "Show data table";
      tableWrap.textContent = "";
      if (!state.showTable) return;
      var years = {};
      var decimals = COUNTRIES.map(dec);
      var series = COUNTRIES.map(function (c) {
        var d = get(c.key, state.sector), byYear = {};
        if (hasSeries(d)) d.years.forEach(function (y, k) { years[y] = 1; byYear[y] = d.electrification_rate[k]; });
        return byYear;
      });
      var table = el("table", "ps2-table");
      var tr = el("tr");
      tr.appendChild(el("th", "", "Year"));
      COUNTRIES.forEach(function (c) { tr.appendChild(el("th", "", c.label)); });
      var thead = el("thead");
      thead.appendChild(tr);
      table.appendChild(thead);
      var tbody = el("tbody");
      Object.keys(years).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
        var r = el("tr");
        r.appendChild(el("td", "", String(y)));
        series.forEach(function (s, k) { r.appendChild(el("td", "", y in s ? pct(s[y], decimals[k]) : "–")); });
        tbody.appendChild(r);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
    }

    function renderSources() {
      sourcesEl.textContent = "";
      COUNTRIES.forEach(function (c) {
        var d = get(c.key, state.sector) || get(c.key, "Whole economy");
        if (!d || !d.source_name) return;
        var p = el("p");
        var b = el("b", "", c.label + ": ");
        p.appendChild(b);
        // A source's own required attribution statement where it has one (MoSPI), else name and licence.
        var text = d.attribution || (d.source_name + " (" + d.licence + ").");
        if (d.cross_checked_against && d.cross_checked_against.length) {
          text += " " + sectorLabel(state.sector) + " cross-checked against " + d.cross_checked_against.join("; ") + ".";
        }
        p.appendChild(document.createTextNode(text));
        sourcesEl.appendChild(p);
      });
    }

    // Follow the site's light/dark toggle (Ghost themes flip a class or
    // data attribute on <html> or <body>).
    var lastDark = ui.classList.contains("ps2-dark");
    var watcher = new MutationObserver(function () {
      applyTheme();
      var now = ui.classList.contains("ps2-dark");
      if (now !== lastDark && chartEl) { lastDark = now; paint(); renderTrend(); }
    });
    [document.documentElement, document.body].forEach(function (n) {
      if (n) watcher.observe(n, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".pselec"), initWidget);
})();
