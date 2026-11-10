// Shared visual basemap for all Power Socket geographic widgets.
//
// OpenFreeMap vector data, rendered with MapLibre GL JS. No map provider API key.
// Light = Positron, dark = OpenFreeMap Dark. Keep OpenMapTiles / OSM attribution.
// Consumer: powersocket-grid-headroom's /api/widget prepends this script.
// Other Ghost maps should reuse PowerSocketMaps.create() rather than add a
// different tile provider. Site-specific data and markers stay with each widget.
(function (global) {
  "use strict";
  if (global.PowerSocketMaps) return;

  var MAPLIBRE_VERSION = "5.8.0";
  var MAPLIBRE_CDN = "https://unpkg.com/maplibre-gl@" + MAPLIBRE_VERSION + "/dist/";
  var STYLES = Object.freeze({
    light: "https://tiles.openfreemap.org/styles/positron",
    dark: "https://tiles.openfreemap.org/styles/dark"
  });
  var COLORS = Object.freeze({
    operational: "#D63F47",
    construction: "#E8A13A",
    planned: "#4C87D9",
    unverified: "#9299A5",
    nonoperational: "#707781"
  });
  var libraryPromise = null;

  function isDark() {
    var preferred = document.documentElement.getAttribute("data-theme") ||
      document.body.getAttribute("data-theme");
    if (preferred === "dark") return true;
    if (preferred === "light") return false;
    return !!(global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function styleUrl() {
    return STYLES[isDark() ? "dark" : "light"];
  }

  function loadMapLibre() {
    if (global.maplibregl && global.maplibregl.Map) return Promise.resolve(global.maplibregl);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise(function (resolve, reject) {
      var id = "ps-maplibre-css";
      if (!document.getElementById(id)) {
        var css = document.createElement("link");
        css.id = id;
        css.rel = "stylesheet";
        css.href = MAPLIBRE_CDN + "maplibre-gl.css";
        document.head.appendChild(css);
      }
      var script = document.createElement("script");
      script.src = MAPLIBRE_CDN + "maplibre-gl.js";
      script.async = true;
      script.onload = function () {
        if (!global.maplibregl || !global.maplibregl.Map) {
          reject(new Error("MapLibre library did not initialise"));
          return;
        }
        resolve(global.maplibregl);
      };
      script.onerror = function () {
        reject(new Error("MapLibre basemap library unavailable"));
      };
      document.head.appendChild(script);
    }).catch(function (err) {
      libraryPromise = null;
      throw err;
    });
    return libraryPromise;
  }

  function create(container, options) {
    options = options || {};
    return loadMapLibre().then(function (lib) {
      if (lib.supported && !lib.supported()) throw new Error("Interactive vector maps not supported");
      var map = new lib.Map({
        container: container,
        style: styleUrl(),
        center: options.center || [134.0, -26.0],
        zoom: options.zoom == null ? 4 : options.zoom,
        maxZoom: options.maxZoom || 18,
        attributionControl: true,
        cooperativeGestures: true
      });
      map.addControl(new lib.NavigationControl({showCompass: false}), "top-right");
      // Keep map style synced with the site's existing light/dark switch.
      // DOM markers are deliberately separate from the style: they survive
      // setStyle() when the reader changes appearance.
      var observedDark = isDark();
      var obs = new MutationObserver(function () {
        var next = isDark();
        if (next !== observedDark) {
          observedDark = next;
          map.setStyle(styleUrl());
        }
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
      if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
      map.on("remove", function () { obs.disconnect(); });
      return {lib: lib, map: map};
    });
  }

  function marker(lib, lat, lon, color, radius) {
    var dot = document.createElement("span");
    dot.className = "ps-map-marker";
    var size = radius || 12;
    dot.style.cssText = [
      "width:" + size + "px",
      "height:" + size + "px",
      "border-radius:50%",
      "display:block",
      "background:" + (color || COLORS.unverified),
      "border:2px solid white",
      "box-shadow:0 0 0 1px rgba(16,18,22,.28)",
      "cursor:pointer"
    ].join(";");
    var obj = new lib.Marker({element: dot, anchor: "center"})
      .setLngLat([lon, lat]);
    return {marker:obj, element:dot};
  }

  global.PowerSocketMaps = Object.freeze({
    provider: "OpenFreeMap",
    styles: STYLES,
    colors: COLORS,
    styleUrl: styleUrl,
    load: loadMapLibre,
    create: create,
    marker: marker,
    attribution: "© OpenMapTiles · Data from OpenStreetMap"
  });
})(window);
