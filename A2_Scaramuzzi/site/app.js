// Map of Montréal building roof outlines, economic planning zones, and green spaces.
// The source GeoJSON coordinates use EPSG:32188, so convert them to
// longitude/latitude before displaying them in Leaflet.
const map = L.map('map');
const montrealIslandBounds = L.latLngBounds(
  [45.39, -74.02],
  [45.72, -73.47]
);
map.fitBounds(montrealIslandBounds);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

proj4.defs(
  'EPSG:32188',
  '+proj=tmerc +lat_0=0 +lon_0=-73.5 +k=0.9999 +x_0=304800 +y_0=0 +datum=NAD83 +units=m +no_defs'
);

function toWgs84(coordinates) {
  if (typeof coordinates[0] === 'number') {
    const [longitude, latitude] = proj4('EPSG:32188', 'EPSG:4326', coordinates);
    return [longitude, latitude, ...coordinates.slice(2)];
  }
  return coordinates.map(toWgs84);
}

function convertGeoJSON(data) {
  const converted = {
    ...data,
    features: data.features.map(function (feature) {
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: toWgs84(feature.geometry.coordinates)
        }
      };
    })
  };
  delete converted.crs;
  return converted;
}

Promise.all([
  fetch('../Data/intens_affect/economic_activities.geojson').then(checkResponse),
  fetch('../Data/affect_espacevertlocal/affect_espacevertlocal.json').then(checkResponse),
  fetch('../Data/buildings/building_footprints_in_economic_zones.geojson').then(checkResponse)
])
.then(function (datasets) {
  const allEconomic = convertGeoJSON(datasets[0]);
  const greenSpaces = convertGeoJSON(datasets[1]);
  const buildings = convertGeoJSON(datasets[2]);
  const distanceSlider = document.getElementById('distance-slider');
  const maxScreeningDistance = Number(distanceSlider.max);
  const screenedBuildings = buildings.features.filter(function (feature) {
    return Number(feature.properties.greenspace_distance_m) <= maxScreeningDistance;
  });

  const filteredBuildingsLayer = L.geoJSON({
  type: 'FeatureCollection',
  features: []
}, {
  style: function (feature) {
    const distance = feature.properties.greenspace_distance_m;

    if (distance <= 50) {
      return {
        color: '#9a4c0b',
        fillColor: '#e99535',
        fillOpacity: 0.3,
        weight: 1
      };
    } else if (distance <= 100) {
      return {
        color: '#8a6a22',
        fillColor: '#f1cb73',
        fillOpacity: 0.24,
        weight: 0.8
      };
    } else {
      return {
        color: '#475569',
        fillColor: '#94a3b8',
        fillOpacity: 0.12,
        weight: 0.7
      };
    }
  },
  onEachFeature: function (feature, layer) {
    const p = feature.properties;

    layer.bindPopup('<strong>Building roof outline (2016)</strong>' +
      '<br>Roof area: ' + safeText(p.roof_area_m2) + ' m²' +
      '<br>Distance to mapped greenspace: ' + safeText(p.greenspace_distance_m) + ' m' +
      '<br>Overlap with economic planning zone: ' +
      safeText(p.economic_zone_overlap_percent) + '%');
  }
});

  const economicZoneLayer = L.geoJSON(allEconomic, {
    style: { color: '#334155', fillColor: '#94a3b8', fillOpacity: 0, weight: 1, dashArray: '4 3' },
    onEachFeature: function (feature, layer) {
      layer.bindPopup('<strong>Economic activity planning zone</strong><br>' +
        safeText(feature.properties.Affectatio || 'Economic activities') +
        '<br>This broad zone is shown for context; building outlines are mapped separately.');
    }
  });

  const greenLayer = L.geoJSON(greenSpaces, {
    style: { color: '#17683c', fillColor: '#36a269', fillOpacity: 0.38, weight: 0.8 },
    onEachFeature: function (feature, layer) {
      const p = feature.properties || {};
      const details = [];
      if (p.ARRONDISSE) details.push('Borough: ' + safeText(p.ARRONDISSE));
      if (p.NUM_INDEX) details.push('Index: ' + safeText(p.NUM_INDEX));
      if (p.ParcPUM) details.push('PUM park designation: ' + safeText(p.ParcPUM));
      layer.bindPopup('<strong>Local greenspace</strong>' +
        (details.length ? '<br>' + details.join('<br>') : '<br>Mapped local green-space feature'));
    }
  });

  const areaNavigator = L.control({ position: 'topright' });
  let selectedAreaLayer;
  let matchingBuildings = [];
  let navigatorExpanded = false;

  areaNavigator.onAdd = function () {
    const container = L.DomUtil.create('div', 'area-navigator leaflet-bar');
    const actions = L.DomUtil.create('div', 'area-navigator-actions', container);
    const zoomButton = L.DomUtil.create('button', 'area-navigator-zoom', actions);
    const resetButton = L.DomUtil.create('button', 'area-navigator-reset', actions);
    const panel = L.DomUtil.create('div', 'area-navigator-panel', container);
    panel.hidden = true;
    const label = L.DomUtil.create('label', 'area-navigator-label', panel);
    const select = L.DomUtil.create('select', 'area-navigator-select', panel);
    const previousButton = L.DomUtil.create('button', 'area-navigator-arrow', panel);
    const nextButton = L.DomUtil.create('button', 'area-navigator-arrow', panel);

    zoomButton.type = 'button';
    zoomButton.textContent = 'Zoom';
    zoomButton.setAttribute('aria-expanded', 'false');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset';
    resetButton.setAttribute('aria-label', 'Reset the distance filter and map view');
    label.htmlFor = 'area-navigator-select';
    label.textContent = 'Filtered areas';
    select.id = 'area-navigator-select';
    select.setAttribute('aria-label', 'Select a filtered economic area to zoom to');
    previousButton.type = 'button';
    previousButton.textContent = '‹';
    previousButton.setAttribute('aria-label', 'Zoom to the previous filtered economic area');
    nextButton.type = 'button';
    nextButton.textContent = '›';
    nextButton.setAttribute('aria-label', 'Zoom to the next filtered economic area');

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    zoomButton.addEventListener('click', function () {
      navigatorExpanded = !navigatorExpanded;
      panel.hidden = !navigatorExpanded;
      zoomButton.textContent = navigatorExpanded ? 'Hide' : 'Zoom';
      zoomButton.setAttribute('aria-expanded', String(navigatorExpanded));
      if (navigatorExpanded && matchingBuildings.length) {
        focusArea(Number(select.value) || 0);
      }
    });
    resetButton.addEventListener('click', resetMapView);
    select.addEventListener('change', function () {
      focusArea(Number(select.value));
    });
    previousButton.addEventListener('click', function () {
      if (matchingBuildings.length) {
        focusArea((Number(select.value) - 1 + matchingBuildings.length) % matchingBuildings.length);
      }
    });
    nextButton.addEventListener('click', function () {
      if (matchingBuildings.length) {
        focusArea((Number(select.value) + 1) % matchingBuildings.length);
      }
    });

    return container;
  };
  areaNavigator.addTo(map);

  function focusArea(index) {
    const feature = matchingBuildings[index];
    if (!feature) return;

    const select = document.getElementById('area-navigator-select');
    select.value = String(index);

    if (selectedAreaLayer) {
      map.removeLayer(selectedAreaLayer);
    }

    selectedAreaLayer = L.geoJSON(feature, {
      style: {
        color: '#1769aa',
        fillColor: '#f6d743',
        fillOpacity: 0.45,
        weight: 4
      }
    }).addTo(map);

    const bounds = selectedAreaLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 17 });
    }
    selectedAreaLayer.bringToFront();
  }

  function updateAreaNavigator(features) {
    const select = document.getElementById('area-navigator-select');
    const arrowButtons = document.querySelectorAll('.area-navigator-arrow');
    matchingBuildings = features.slice().sort(function (first, second) {
      return Number(first.properties.greenspace_distance_m) -
        Number(second.properties.greenspace_distance_m);
    });
    select.replaceChildren();

    matchingBuildings.forEach(function (feature, index) {
      const option = document.createElement('option');
      const properties = feature.properties;
      option.value = String(index);
      option.textContent = 'Area ' + safeText(properties.source_id) +
        ' · ' + Math.round(Number(properties.greenspace_distance_m)) + ' m';
      select.appendChild(option);
    });

    const hasMatches = features.length > 0;
    select.disabled = !hasMatches;
    arrowButtons.forEach(function (button) {
      button.disabled = !hasMatches;
    });
    if (selectedAreaLayer) {
      map.removeLayer(selectedAreaLayer);
      selectedAreaLayer = null;
    }
  }

  // Add the filtered building layer and greenspaces to the map.
  filteredBuildingsLayer.addTo(map);
  greenLayer.addTo(map);

  // Layer selector.
  L.control.layers(null, {
    'Filtered building roof outlines': filteredBuildingsLayer,
    'Economic planning zones (context)': economicZoneLayer,
    'Local green spaces': greenLayer
  }, { collapsed: false, position: 'topleft' }).addTo(map);

  // Connect the distance slider to the building layer.
  const distanceValue = document.getElementById('distance-value');
  const filterCount = document.getElementById('filter-count');
  const headlineCount = document.getElementById('headline-count');
  const headlineLabel = document.getElementById('headline-label');
  const selectedCount = document.getElementById('selected-count');
  const selectedLabel = document.getElementById('selected-label');
  const nearRatio = document.getElementById('near-ratio');
  const nearRatioLabel = document.getElementById('near-ratio-label');

  function updateDistanceFilter() {
    const maxDistance = Number(distanceSlider.value);

    matchingBuildings = screenedBuildings.filter(function (feature) {
      return Number(feature.properties.greenspace_distance_m) <= maxDistance;
    });

    updateAreaNavigator(matchingBuildings);

    filteredBuildingsLayer.clearLayers();

    filteredBuildingsLayer.addData({
      type: 'FeatureCollection',
      features: matchingBuildings
    });

    distanceValue.textContent = maxDistance + ' m';

    filterCount.textContent =
      'Showing ' + matchingBuildings.length + ' of ' + screenedBuildings.length +
      ' roof outlines within ' + maxDistance + ' m of mapped greenspace.';

    headlineCount.textContent =
      matchingBuildings.length + ' of ' + screenedBuildings.length;
    headlineLabel.textContent = 'roof outlines within ' + maxDistance +
      ' m of mapped greenspace';
    selectedCount.textContent = matchingBuildings.length + ' / ' + screenedBuildings.length;
    selectedLabel.textContent = 'Selected roof outlines within ' + maxDistance +
      ' m of mapped greenspace';
    nearRatio.textContent = matchingBuildings.length + ' / ' + screenedBuildings.length;
    nearRatioLabel.textContent = 'roof outlines within ' + maxDistance +
      ' m of mapped greenspace.';

    if (matchingBuildings.length === 0) {
      filterCount.textContent =
        'No roof outlines found within ' + maxDistance + ' m of mapped greenspace.';
    }
  }

  function resetMapView() {
    const select = document.getElementById('area-navigator-select');
    const panel = document.querySelector('.area-navigator-panel');
    const zoomButton = document.querySelector('.area-navigator-zoom');

    distanceSlider.value = distanceSlider.defaultValue;
    navigatorExpanded = false;
    panel.hidden = true;
    zoomButton.textContent = 'Zoom';
    zoomButton.setAttribute('aria-expanded', 'false');
    updateDistanceFilter();
    select.selectedIndex = 0;
    map.fitBounds(montrealIslandBounds);
  }

  distanceSlider.addEventListener('input', function () {
    updateDistanceFilter();
  });

  // Apply the initial slider value.
updateDistanceFilter();

  document.getElementById('status').textContent =
    'Loaded ' + buildings.features.length + ' building roof outlines from 2016, filtered by overlap with ' +
    allEconomic.features.length + ' economic planning zones, and ' +
    greenSpaces.features.length + ' local green-space features.';
})
.catch(function (error) {
  document.getElementById('status').textContent =
    'Some map data could not be loaded. Run Notebooks/process_building_footprints.py to create the building layer, then open this page with Live Server.';
  console.error(error);
});

function checkResponse(response) {
  if (!response.ok) throw new Error('Could not load data: ' + response.url + ' (' + response.status + ')');
  return response.json();
}

// Keep text from dataset properties from being interpreted as HTML in popups.
function safeText(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
  });
}
