// PowerSocket Global Electrification Tracker widget, for the Ghost page.
// Embed with (see electrification-page.html):
//   <div class="pselec" data-api="..." data-countries='[...]' data-sectors='[...]'></div>
//   <script src="https://cdn.jsdelivr.net/gh/OWNER/REPO@main/electrification-widget.js"></script>
//
// Unlike widget.js (NEM/ERCOT live 5-min feeds), this calls a private API
// that returns one country/sector's year series at a time -- there's no
// bulk-data endpoint for this page to fetch from.
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
  var LINE_COLOR = "#2F9E7E";

  function initWidget(root) {
    if (!root.dataset.api) return;
    var api = root.dataset.api;
    var COUNTRIES = DEFAULT_COUNTRIES, SECTORS = DEFAULT_SECTORS;
    if (root.dataset.countries) {
      try { COUNTRIES = JSON.parse(root.dataset.countries); } catch (e) { /* fall back to default */ }
    }
    if (root.dataset.sectors) {
      try { SECTORS = JSON.parse(root.dataset.sectors); } catch (e) { /* fall back to default */ }
    }

    var state = { country: COUNTRIES[0].key, sector: SECTORS[0].key, cache: {} };

    root.innerHTML =
      '<div class="pe-controls">' +
      '<div class="pe-group" data-role="countries"></div>' +
      '<div class="pe-group" data-role="sectors"></div>' +
      "</div>" +
      '<div class="pe-stats" data-role="stats"></div>' +
      '<div class="pe-chart" data-role="chart"></div>' +
      // Styled here rather than in the page snippet, so adding it didn't need a re-paste in Ghost.
      '<div class="pe-caveat" data-role="caveat" style="display:none;font-size:.85rem;margin-top:.5rem;' +
      'padding:.5rem .75rem;border-left:3px solid rgba(214,160,40,.85);background:rgba(214,160,40,.1)"></div>' +
      '<div class="pe-meta" data-role="meta"></div>';

    var countriesEl = root.querySelector('[data-role="countries"]');
    var sectorsEl = root.querySelector('[data-role="sectors"]');
    var statsEl = root.querySelector('[data-role="stats"]');
    var chartEl = root.querySelector('[data-role="chart"]');
    var metaEl = root.querySelector('[data-role="meta"]');
    var caveatEl = root.querySelector('[data-role="caveat"]');

    // A documented disagreement between official sources: shown in full, not in the fine print.
    function showCaveat(text) {
      caveatEl.textContent = text ? "Note: " + text : "";
      caveatEl.style.display = text ? "" : "none";
    }

    function addButtons(group, items, isActive, onPick) {
      items.forEach(function (item) {
        var b = document.createElement("button");
        b.className = "pe-btn" + (isActive(item) ? " active" : "");
        b.textContent = item.label;
        b.addEventListener("click", function () {
          onPick(item);
          Array.prototype.forEach.call(group.children, function (el) {
            el.classList.toggle("active", el === b);
          });
          render();
        });
        group.appendChild(b);
      });
    }

    addButtons(countriesEl, COUNTRIES, function (c) { return c.key === state.country; },
      function (c) { state.country = c.key; });
    addButtons(sectorsEl, SECTORS, function (s) { return s.key === state.sector; },
      function (s) { state.sector = s.key; });

    // Plotly.newPlot only replaces its own plot, not other children of
    // chartEl, so clear the chart area fully before showing either.
    function clearChart() {
      if (window.Plotly) Plotly.purge(chartEl);
      chartEl.innerHTML = "";
    }

    function showError(message) {
      clearChart();
      chartEl.innerHTML = '<div class="pe-error">' + message + "</div>";
      statsEl.innerHTML = "";
      metaEl.textContent = "";
      showCaveat(null);
    }

    function fetchSeries(country, sector) {
      var cacheKey = country + "|" + sector;
      if (state.cache[cacheKey]) return Promise.resolve(state.cache[cacheKey]);
      var url = api + "?country=" + encodeURIComponent(country) + "&sector=" + encodeURIComponent(sector);
      return fetch(url, { cache: "no-store" }).then(function (resp) {
        if (!resp.ok) throw new Error("status " + resp.status);
        return resp.json();
      }).then(function (json) {
        state.cache[cacheKey] = json;
        return json;
      });
    }

    var latestRequest = 0;

    function render() {
      // Ignore responses for a selection the reader has already clicked away from.
      var request = ++latestRequest;
      fetchSeries(state.country, state.sector)
        .then(function (data) {
          if (request === latestRequest) renderChart(data);
        })
        .catch(function () {
          if (request === latestRequest) showError("Electrification data is unavailable right now.");
        });
    }

    function renderChart(data) {
      if (data.withheld) {
        showError("Not published yet: " + data.reason);
        return;
      }
      if (!data.years || !data.years.length) {
        showError("No data yet for this country/sector.");
        return;
      }
      clearChart();
      var fg = getComputedStyle(root).color;
      var grid = "rgba(128,128,128,0.25)";

      Plotly.newPlot(
        chartEl,
        [{
          x: data.years,
          y: data.electrification_rate,
          mode: "lines+markers",
          line: { width: 2.5, color: LINE_COLOR },
          marker: { size: 5, color: LINE_COLOR },
          hovertemplate: "%{x}: %{y:.1f}%<extra></extra>"
        }],
        {
          margin: { t: 20, r: 20, b: 40, l: 50 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { color: fg },
          xaxis: { gridcolor: grid, zerolinecolor: grid, tickformat: "d" },
          yaxis: { title: "% of final energy", gridcolor: grid, zerolinecolor: grid, rangemode: "tozero" },
          hovermode: "x"
        },
        { responsive: true, displayModeBar: false }
      );

      var latest = data.electrification_rate[data.electrification_rate.length - 1];
      var first = data.electrification_rate[0];
      var html =
        stat("Latest (" + data.updated_through + ")", latest !== null ? latest.toFixed(1) + "%" : "–") +
        stat("Change since " + data.years[0], (latest !== null && first !== null) ? (latest - first >= 0 ? "+" : "") + (latest - first).toFixed(1) + " pts" : "–");
      statsEl.innerHTML = html;

      var meta = "Source: " + data.source_name + " (" + data.licence + ")";
      if (data.cross_checked_against && data.cross_checked_against.length) {
        meta += " • Cross-checked against: " + data.cross_checked_against.join("; ");
      }
      if (state.country === "US" && state.sector === "Transport") {
        meta += " • EIA counts home EV charging as residential electricity, so this understates EV uptake.";
      }
      metaEl.textContent = meta;
      showCaveat(data.caveat);
    }

    function stat(label, value) {
      return (
        '<div class="pe-stat"><div class="pe-label">' +
        label +
        '</div><div class="pe-value">' +
        value +
        "</div></div>"
      );
    }

    render();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".pselec"), initWidget);
})();
