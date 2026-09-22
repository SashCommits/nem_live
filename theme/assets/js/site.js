/* Interface: colour-mode toggle and the small-screen navigation panel. */
(function () {
  'use strict';

  var root = document.documentElement;

  /* --- Colour mode ------------------------------------------------------ */
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function activeMode() {
    var explicit = root.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return systemPrefersDark() ? 'dark' : 'light';
  }

  /* The two theme-color tags are media-scoped to the OS preference, so an
     explicit choice that contradicts the OS would otherwise leave the mobile
     browser chrome showing the wrong colour. Pin it to the active mode. */
  function syncThemeColor(mode) {
    var colour = mode === 'dark' ? '#101317' : '#FBFAF8';
    var pinned = document.querySelector('meta[name="theme-color"][data-pinned]');
    if (!pinned) {
      pinned = document.createElement('meta');
      pinned.setAttribute('name', 'theme-color');
      pinned.setAttribute('data-pinned', '');
      document.head.appendChild(pinned);
    }
    pinned.setAttribute('content', colour);
  }

  var toggle = document.querySelector('[data-theme-toggle]');
  if (root.getAttribute('data-theme')) syncThemeColor(activeMode());

  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = activeMode() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('ps-theme', next); } catch (e) {}
      syncThemeColor(next);
      // Embedded widgets read their colours from the page at draw time, so
      // tell them to redraw rather than waiting for their own refresh tick.
      window.dispatchEvent(new CustomEvent('ps:themechange', { detail: { mode: next } }));
    });
  }

  /* --- Navigation panel -------------------------------------------------- */
  var navToggle = document.querySelector('[data-nav-toggle]');
  var nav = document.getElementById('site-nav');
  if (navToggle && nav) {
    // The js-nav class is set pre-paint in default.hbs, not here — adding it
    // this late painted the panel open and then collapsed it.
    navToggle.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', open ? 'false' : 'true');
      navToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

    // Reset to the desktop rail when the panel stops being a panel.
    var wide = window.matchMedia('(min-width: 861px)');
    var sync = function (e) {
      if (e.matches) {
        nav.setAttribute('data-open', 'false');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    };
    if (wide.addEventListener) wide.addEventListener('change', sync);
    else if (wide.addListener) wide.addListener(sync);
  }
})();

(function () {
  'use strict';
  var csvUrl = document.body.getAttribute('data-csv');
  var ticker = document.querySelector('[data-ticker]');
  var dash = document.querySelector('[data-dashboard]');

  var DEFAULT_GROUPS = [
    ['Deployment', ['Global EV sales|units', 'Grid-scale battery deployments|GWh', 'Solar installations|GW', 'Wind installations|GW', 'Heat-pump sales|units', 'Electrolyser deployments|MW']],
    ['Demand', ['Electricity demand growth|% y/y', 'Data-centre electricity demand|TWh']],
    ['Cost & supply chain', ['Battery-cell prices|US$/kWh', 'Battery manufacturing capacity|GWh/yr', 'Lithium carbonate|US$/t', 'Nickel|US$/t', 'Copper|US$/t']],
    ['Capital', ['Transmission investment|US$bn']]
  ];
  var DEFAULT_MARKETS = ['NEM', 'ERCOT', 'CAISO', 'Germany', 'UK', 'China', 'India'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parseCSV(text) {
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    var head = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); }).map(function (r) {
      var o = {};
      head.forEach(function (h, idx) { o[h] = (r[idx] || '').trim(); });
      return o;
    });
  }

  function tile(r) {
    return '<div class="dash-tile">' +
      '<div class="name">' + esc(r.indicator) + '</div>' +
      '<div class="unit">' + esc(r.unit) + '</div>' +
      '<div class="val">' + esc(r.value || '—') + '</div>' +
      '<div class="chg"><span>m/m ' + esc(r.change_mm || '—') + '</span><span>y/y ' + esc(r.change_yy || '—') + '</span></div>' +
      (r.source ? '<div class="src">Source: ' + esc(r.source) + '</div>' : '') +
      '</div>';
  }

  function renderDashboard(rows) {
    if (!dash) return;
    var groups = {}, order = [];
    rows.forEach(function (r) {
      var g = r.group || 'Other';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(r);
    });
    var html = '';
    order.filter(function (g) { return g.toLowerCase() !== 'markets'; }).forEach(function (g) {
      html += '<section class="dash-group"><h2>' + esc(g) + '</h2><div class="dash-grid">' + groups[g].map(tile).join('') + '</div></section>';
    });
    var markets = groups.Markets || groups.markets || [];
    if (markets.length) {
      html += '<section class="dash-group"><h2>Electricity markets</h2><div class="dash-table-wrap"><table class="dash-table">' +
        '<thead><tr><th scope="col">Market</th><th scope="col">Avg price</th><th scope="col">Unit</th><th scope="col">m/m</th><th scope="col">y/y</th><th scope="col">Note</th></tr></thead><tbody>' +
        markets.map(function (m) {
          return '<tr><th scope="row">' + esc(m.indicator) + '</th><td class="num">' + esc(m.value || '—') + '</td><td>' + esc(m.unit) + '</td><td class="num">' + esc(m.change_mm || '—') + '</td><td class="num">' + esc(m.change_yy || '—') + '</td><td>' + esc(m.note || m.source || '') + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }
    dash.innerHTML = html || '<p class="dash-note">The data sheet is connected but has no rows yet.</p>';
  }

  function placeholderRows() {
    var rows = [];
    DEFAULT_GROUPS.forEach(function (g) {
      g[1].forEach(function (s) { var p = s.split('|'); rows.push({ group: g[0], indicator: p[0], unit: p[1] }); });
    });
    DEFAULT_MARKETS.forEach(function (m) { rows.push({ group: 'Markets', indicator: m, unit: 'US$/MWh' }); });
    return rows;
  }

  function renderTicker(rows) {
    if (!ticker) return;
    var markets = rows.filter(function (r) { return (r.group || '').toLowerCase() === 'markets' && r.value; });
    if (!markets.length) return;
    ticker.innerHTML = markets.map(function (m) {
      return '<span class="ticker-item"><b>' + esc(m.indicator) + '</b><span>' + esc(m.value) + ' ' + esc(m.unit) + '</span>' +
        (m.change_mm ? '<span class="chg">' + esc(m.change_mm) + '</span>' : '') + '</span>';
    }).join('');
    ticker.hidden = false;
  }

  if (!csvUrl) {
    if (dash) {
      renderDashboard(placeholderRows());
      dash.insertAdjacentHTML('afterbegin', '<p class="dash-note">Figures appear here once a data sheet is connected in Settings → Design → Site-wide.</p>');
    }
    return;
  }

  fetch(csvUrl, { cache: 'no-store' })
    .then(function (res) { if (!res.ok) throw new Error(res.status); return res.text(); })
    .then(function (text) {
      var rows = parseCSV(text);
      renderTicker(rows);
      renderDashboard(rows);
    })
    .catch(function () {
      if (dash) {
        renderDashboard(placeholderRows());
        dash.insertAdjacentHTML('afterbegin', '<p class="dash-note">Couldn\u2019t load the data sheet. Check that it\u2019s published to the web as CSV and the link in Settings → Design is correct.</p>');
      }
    });
})();
