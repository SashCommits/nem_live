// PowerSocket live market widget engine, shared by every market's Ghost page.
// A page embeds it with a small snippet (see nem-page.html / ercot-page.html):
//   <div class="nemlive" data-src="..." data-regions='[{"key":"nem","label":"NEM"},...]'></div>
//   <script src="https://cdn.jsdelivr.net/gh/OWNER/REPO@main/widget.js"></script>
// Multiple widgets (different markets) can coexist on the same page: each
// ".nemlive" container is initialised independently.
(function () {
  var DEFAULT_REGIONS = [
    { key: "nem", label: "NEM" },
    { key: "nsw1", label: "NSW" },
    { key: "qld1", label: "QLD" },
    { key: "vic1", label: "VIC" },
    { key: "sa1", label: "SA" },
    { key: "tas1", label: "TAS" }
  ];
  // Ranges up to 7 days come from the 5-minute file; longer ones from the hourly file.
  var RANGES = [
    { key: "15m", label: "15 min", hours: 0.25 },
    { key: "1h", label: "1 hour", hours: 1 },
    { key: "24h", label: "24 hours", hours: 24 },
    { key: "3d", label: "3 days", hours: 72 },
    { key: "7d", label: "7 days", hours: 168 },
    { key: "1mo", label: "1 month", hours: 24 * 30, long: true },
    { key: "1q", label: "1 quarter", hours: 24 * 91, long: true },
    { key: "1y", label: "1 year", hours: 24 * 365, long: true }
  ];
  var RENEWABLE = ["Bioenergy", "Hydro", "Wind", "Solar (utility)", "Solar (rooftop)"];
  var SUPPLY_COLOR = "#2F9E7E";
  var PRICE_COLOR = "#E8553F";
  // A year of hourly points drawn raw is a solid block of ink, so average into
  // buckets once a range carries more points than the chart can separate.
  var MAX_POINTS = 400;

  function initWidget(root) {
    if (!root.dataset.src) return;
    var dataSrc = root.dataset.src.replace(/\/?$/, "/");
    var REGIONS = DEFAULT_REGIONS;
    if (root.dataset.regions) {
      try { REGIONS = JSON.parse(root.dataset.regions); } catch (e) { /* fall back to default */ }
    }

    var state = { region: REGIONS[0].key, range: "24h", mix: false, cache: {} };

    root.innerHTML =
      '<div class="nl-controls">' +
      '<div class="nl-group" data-role="regions"></div>' +
      '<div class="nl-group" data-role="ranges"></div>' +
      '<div class="nl-group" data-role="mix"></div>' +
      '<div class="nl-group" data-role="reset"></div>' +
      "</div>" +
      '<div class="nl-stats" data-role="stats"></div>' +
      '<div class="nl-chart" data-role="chart"></div>' +
      '<div class="nl-meta" data-role="meta"></div>';

    var regionsEl = root.querySelector('[data-role="regions"]');
    var rangesEl = root.querySelector('[data-role="ranges"]');
    var mixEl = root.querySelector('[data-role="mix"]');
    var resetEl = root.querySelector('[data-role="reset"]');
    var statsEl = root.querySelector('[data-role="stats"]');
    var chartEl = root.querySelector('[data-role="chart"]');
    var metaEl = root.querySelector('[data-role="meta"]');

    function addButtons(group, items, isActive, onPick) {
      items.forEach(function (item) {
        var b = document.createElement("button");
        b.className = "nl-btn" + (isActive(item) ? " active" : "");
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

    addButtons(regionsEl, REGIONS, function (r) { return r.key === state.region; },
      function (r) { state.region = r.key; });
    addButtons(rangesEl, RANGES, function (r) { return r.key === state.range; },
      function (r) { state.range = r.key; });

    var mixBtn = document.createElement("button");
    mixBtn.className = "nl-btn";
    mixBtn.textContent = "Energy mix";
    mixBtn.addEventListener("click", function () {
      if (mixBtn.disabled) return;
      state.mix = !state.mix;
      mixBtn.classList.toggle("active", state.mix);
      render();
    });
    mixEl.appendChild(mixBtn);

    var resetBtn = document.createElement("button");
    resetBtn.className = "nl-btn";
    resetBtn.textContent = "Reset view";
    resetBtn.addEventListener("click", function () {
      // A fresh Plotly.newPlot() call replaces the figure outright, which
      // discards any manual zoom/pan and snaps back to the selected range.
      render();
    });
    resetEl.appendChild(resetBtn);

    function showError(message) {
      chartEl.innerHTML = '<div class="nl-error">' + message + "</div>";
      statsEl.innerHTML = "";
      metaEl.textContent = "";
    }

    function currentRange() {
      return RANGES.filter(function (r) { return r.key === state.range; })[0];
    }

    function fetchRegion(key, long) {
      var name = long ? key + "-long" : key;
      if (state.cache[name]) return Promise.resolve(state.cache[name]);
      return fetch(dataSrc + name + ".json", { cache: "no-store" }).then(function (resp) {
        if (!resp.ok) throw new Error("status " + resp.status);
        return resp.json();
      }).then(function (json) {
        state.cache[name] = json;
        return json;
      });
    }

    function lastValid(arr) {
      if (!arr) return null;
      for (var i = arr.length - 1; i >= 0; i--) {
        if (arr[i] !== null && arr[i] !== undefined) return arr[i];
      }
      return null;
    }

    function bucketize(t, arrays) {
      var n = t.length;
      if (n <= MAX_POINTS) return { t: t, arrays: arrays };
      var step = Math.ceil(n / MAX_POINTS);
      var outT = [];
      var outs = arrays.map(function () { return []; });
      for (var i = 0; i < n; i += step) {
        var end = Math.min(i + step, n);
        outT.push(t[i]);
        for (var a = 0; a < arrays.length; a++) {
          var sum = 0, count = 0;
          for (var j = i; j < end; j++) {
            var v = arrays[a][j];
            if (v !== null && v !== undefined) { sum += v; count++; }
          }
          outs[a].push(count ? sum / count : null);
        }
      }
      return { t: outT, arrays: outs };
    }

    function round(arr, dp) {
      var f = Math.pow(10, dp);
      return arr.map(function (v) { return v === null ? null : Math.round(v * f) / f; });
    }

    // Tick density and date format both need to shrink as the window grows,
    // otherwise a year view prints full timestamps and a 15-minute view prints
    // a redundant date under every tick.
    function xAxisConfig(range, grid) {
      var cfg = {
        type: "date",
        gridcolor: grid,
        zerolinecolor: grid,
        automargin: true,
        tickfont: { size: 11 },
        nticks: 7,
        tickangle: "auto"
      };
      if (range.hours <= 24) {
        cfg.tickformat = "%H:%M";
        cfg.hoverformat = "%H:%M, %d %b";
      } else if (range.hours <= 24 * 7) {
        cfg.tickformat = "%a %d %b";
        cfg.hoverformat = "%a %d %b, %H:%M";
      } else if (range.hours <= 24 * 91) {
        cfg.tickformat = "%d %b";
        cfg.hoverformat = "%d %b %Y";
      } else {
        cfg.tickformat = "%b %Y";
        cfg.hoverformat = "%d %b %Y";
      }
      return cfg;
    }

    function render() {
      var range = currentRange();
      fetchRegion(state.region, range.long)
        .then(renderChart)
        .catch(function () {
          showError(range.long
            ? "Long-range history is not available yet."
            : "Live data is unavailable right now.");
        });
    }

    function renderChart(data) {
      var range = currentRange();
      var perHour = 60 / (data.interval_minutes || 5);
      var n = Math.max(2, Math.min(data.t.length, Math.round(range.hours * perHour)));
      var start = data.t.length - n;
      var t = data.t.slice(start);

      var fuels = data.fuels || [];
      mixBtn.disabled = fuels.length === 0;
      mixBtn.title = fuels.length ? "" : "Fuel mix data is not available yet";
      if (mixBtn.disabled) {
        state.mix = false;
        mixBtn.classList.remove("active");
      }

      var fg = getComputedStyle(root).color;
      var grid = "rgba(128,128,128,0.25)";

      // Stack first so the supply/demand lines draw on top of it.
      var specs = [];
      if (state.mix) {
        fuels.forEach(function (f) {
          specs.push({ name: f.name, values: data.series[f.name], fuel: f });
        });
      }
      if (data.supply) specs.push({ name: "Supply", values: data.supply, color: SUPPLY_COLOR });
      specs.push({ name: "Demand", values: data.demand, color: fg, dash: "dot" });
      specs.push({ name: "Price", values: data.price, color: PRICE_COLOR, axis: "y2", dp: 2 });

      var binned = bucketize(t, specs.map(function (s) { return s.values.slice(start); }));
      var x = binned.t;

      var traces = specs.map(function (s, i) {
        var y = round(binned.arrays[i], s.dp || 0);
        if (s.fuel) {
          return {
            x: x, y: y, name: s.name,
            // Charging and pumping are load, not generation: stack them below the
            // zero line instead of letting them eat into the generation stack.
            stackgroup: s.fuel.negative ? "mix-load" : "mix-gen",
            mode: "lines",
            line: { width: 0, color: s.fuel.color },
            fillcolor: s.fuel.color,
            hoverinfo: "x+y+name"
          };
        }
        return {
          x: x, y: y, name: s.name,
          mode: "lines",
          yaxis: s.axis,
          line: { width: s.name === "Price" ? 1.5 : 2, color: s.color, dash: s.dash },
          hoverinfo: "x+y+name"
        };
      });

      Plotly.newPlot(
        chartEl,
        traces,
        {
          margin: { t: 20, r: 58, b: 40, l: 58 },
          showlegend: true,
          legend: { orientation: "h", y: -0.15 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { color: fg },
          xaxis: xAxisConfig(range, grid),
          // The stack has to sit on a zero baseline; the plain lines read better auto-scaled.
          yaxis: { title: "MW", gridcolor: grid, zerolinecolor: grid, rangemode: state.mix ? "tozero" : "normal" },
          yaxis2: { title: "$/MWh", overlaying: "y", side: "right", showgrid: false },
          hovermode: "x unified"
        },
        { responsive: true, displayModeBar: false }
      );

      var lastDemand = lastValid(data.demand);
      var lastSupply = lastValid(data.supply);
      var lastPrice = lastValid(data.price);

      // Share of generation, not of demand: rooftop solar sits behind the meter
      // and so is missing from operational demand, which pushes the ratio past
      // 100% around midday. Charging and pumping are load, so exclude them.
      var renewableTotal = 0, generationTotal = 0;
      fuels.forEach(function (f) {
        var v = lastValid(data.series[f.name]) || 0;
        if (v <= 0) return;
        generationTotal += v;
        if (RENEWABLE.indexOf(f.name) !== -1) renewableTotal += v;
      });

      var html =
        stat("Price now", lastPrice !== null ? "$" + lastPrice.toFixed(2) + "/MWh" : "–") +
        stat("Demand now", lastDemand !== null ? Math.round(lastDemand).toLocaleString() + " MW" : "–") +
        stat("Supply now", lastSupply !== null ? Math.round(lastSupply).toLocaleString() + " MW" : "–");
      if (generationTotal > 0) {
        html += stat("Renewables now", ((100 * renewableTotal) / generationTotal).toFixed(0) + "%");
      }
      statsEl.innerHTML = html;

      metaEl.textContent = "Updated " + data.updated + " • " + data.timezone;
    }

    function stat(label, value) {
      return (
        '<div class="nl-stat"><div class="nl-label">' +
        label +
        '</div><div class="nl-value">' +
        value +
        "</div></div>"
      );
    }

    // Data refreshes every ~5 minutes server-side; poll for it instead of
    // requiring a manual page reload. Skip ticks while the tab is hidden,
    // and catch up immediately when it becomes visible again rather than
    // waiting out the rest of that interval on a stale chart.
    var REFRESH_MS = 60000;
    setInterval(function () {
      if (document.visibilityState === "hidden") return;
      state.cache = {};
      render();
    }, REFRESH_MS);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        state.cache = {};
        render();
      }
    });

    render();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".nemlive"), initWidget);
})();
