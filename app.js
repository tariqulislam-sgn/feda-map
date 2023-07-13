// Copyright Senckenberg Gesellschaft für Naturforschung. 2022. All Rights Reserved.
//

// Functions
//
async function loadData(dataPath) {
  return fetch(dataPath)
    .then((response) => response.json())
    .catch((error) => console.error("Could not load data!"));
}

// Reorder flow from left-to-right to top-to-bottom
// Basically a Matrix Transpose for a 3 x 3 matrix, if buckets = 3
function reorder(arr, buckets) {
  const rows = Math.ceil(arr.length / 3);
  const cols = buckets;
  
  let indices = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const idx = row * 3 + (col + 1);
      indices.push(idx);
    }
  }
  return arr
    .map((el, i) => ({ el: el, idx: indices[i] }))
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.el);
}

function createImagePath(s, imgPath) {
  return new URL(s, imgPath);
}

function createAnchorElement(href, text) {
  return `<a href="${href}" target="_blank">${text}</a>`;
}

function createDropdownElement(projectsByGroup) {
  let divContainer = document.createElement("div");
  divContainer.setAttribute("id", "feda-leaflet-dropdown");
  divContainer.setAttribute("class", "feda-dropdown leaflet-disabled");

  let btn = document.createElement("button");
  btn.innerHTML = "Ebenen";

  let divContent = document.createElement("div");
  divContent.setAttribute("class", "feda-dropdown-content");

  let linkList = document.createElement("ul");
  linkList.setAttribute("class", "feda-dropdown-menu feda-even-columns");

  for (const group of Object.keys(projectsByGroup)) {
    // Group Heading
    let item = document.createElement("li");
    let link = document.createElement("a");
    link.innerHTML = `<em>${group}</em>`;
    link.setAttribute("id", layerId(group));
    link.setAttribute("href", "#" + group.toLowerCase());
    link.setAttribute("onClick", "return false;");
    item.appendChild(link);
    linkList.appendChild(item);

    reorder(projectsByGroup[group], buckets = 3).forEach((projectName) => {
      let item = document.createElement("li");
      let link = document.createElement("a");
      link.setAttribute("id", layerId(projectName));
      link.setAttribute("href", "#" + projectName.toLowerCase());
      link.setAttribute("onClick", "return false;");
      link.innerText = projectName;
      item.appendChild(link);
      linkList.appendChild(item);
    });
  }

  divContent.appendChild(linkList);
  divContainer.appendChild(btn);
  divContainer.appendChild(divContent);

  return divContainer;
}

function createBindPopup(title, links, img) {
  const popup = L.popup();
  const innerHTML = `
  <div class="popup-content">
  <div class="popup-logo"><img src="${img}" alt="logo"></div>
  <div class="popup-title">
    <strong>${title}</strong>
  </div>
  <div class="popup-link">
    ${links}
  </div>
  </div>`;
  popup.setContent(innerHTML);
  return popup;
}

function listProjects(geojson) {
  let visited = new Set();
  let buf = [];
  for (const f of geojson.features) {
    f.properties.projects.forEach((p) => {
      if (!visited.has(p.name)) {
        buf.push({
          name: p.name,
          label: p.label,
          url: p.wpUrl,
          group: f.properties.group,
        });
      }
      visited.add(p.name);
    });
  }
  return buf.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
}

function groupBy(xs, key) {
  result = {};
  for (const el of xs) {
    let k = el[key];
    result[k] = result[k] || [];
    result[k].push(el.name);
  }
  return result;
}

function listProjectsByGroup(geojson) {
  let projects = listProjects(geojson);
  return groupBy(projects, "group");
}

function layerId(s) {
  return "layer-" + s.toLowerCase().replace(" ", "-");
}

// Create markers and groups them by projects into layers
function createLayer(geojson, imagePath) {
  let layer = {};
  for (const f of geojson.features) {
    [lon, lat] = f.geometry.coordinates;
    let projects = f.properties.projects;
    let institution = f.properties.institution;
    let img = createImagePath(f.properties.img, imagePath);

    const anchors = projects
      .map((p) => createAnchorElement(p.wpUrl, p.name))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .join(", ");

    let marker = L.circleMarker([lat, lon], { color: "#2D8F35", radius: 5 });
    marker.bindPopup(createBindPopup(institution, anchors, img));
    marker.on("mouseover", function (e) {
      this.openPopup();
    });

    projects.forEach((p) => {
      let key = layerId(p.name);
      layer[key] = layer[key] || [];
      layer[key].push(marker);
    });
  }

  Object.entries(layer).forEach(([name, markers]) => {
    layer[name] = L.layerGroup(markers);
  });

  return layer;
}

// Main
//
async function loadMap(cfg) {
  let activeLayers = [];

  let dataPromise = loadData(cfg.dataPath);

  const offset = 4;
  var map = L.map("feda-map", {
    preferCanvas: true,
    minZoom: 6,
    maxZoom: 11,
    zoomControl: false,
    maxBounds: [
      [47.3024876979 - offset, 5.98865807458 - offset],
      [51.983104153 + offset, 15.0169958839 + offset],
    ],
  }).setView([51.1642292, 10.4541194], 6);

  // Move zoom control to the right
  L.control
    .zoom({
      position: "topright",
    })
    .addTo(map);

  // const defaultTiles = "https://{s}.tile.osm.org/{z}/{x}/{y}.png";
  const cartoDbTiles =
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png";
  L.tileLayer(cartoDbTiles, {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
  const geodata = await dataPromise;
  const projectsByGroup = listProjectsByGroup(geodata);

  L.Control.LayerControl = L.Control.extend({
    onAdd: function (map) {
      const el = L.DomUtil.create("div", "");
      const child = createDropdownElement(projectsByGroup);

      child.addEventListener("mouseover", function () {
        map.dragging.disable();
        map.doubleClickZoom.disable();
      });
      child.addEventListener("mouseout", function () {
        map.dragging.enable();
        map.doubleClickZoom.enable();
      });
      el.appendChild(child);

      return el;
    },

    onRemove: function (map) {
      // Nothing to do here
    },
  });

  L.control.layerControl = function (opts) {
    return new L.Control.LayerControl(opts);
  };

  L.control
    .layerControl({
      position: "topleft",
    })
    .addTo(map);

  // Create layer per Project
  const layerByProject = createLayer(geodata, cfg.imgPath);

  // Cluster all marker
  const groupCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 20,
  });
  Object.entries(layerByProject).forEach(([_, layer]) => {
    groupCluster.addLayer(layer);
  });

  map.addLayer(groupCluster);
  activeLayers.push(groupCluster);

  // Add event handler
  Object.keys(projectsByGroup).forEach((group) => {
    document.getElementById(layerId(group)).onclick = () => {
      activeLayers.map((l) => map.removeLayer(l));
      map.addLayer(groupCluster);
      activeLayers.push(groupCluster);
    };

    projectsByGroup[group].forEach((project) => {
      const projLayerId = layerId(project);
      document.getElementById(projLayerId).onclick = () => {
        activeLayers.map((l) => map.removeLayer(l));
        const l = layerByProject[projLayerId];
        map.addLayer(l);
        activeLayers.push(l);
      };
    });
  });
}

mapContainer = document.getElementById("feda-map");
if (mapContainer) {
  const protocol = location.protocol;
  const hostUrl = mapContainer.dataset.hostUrl || location.host;

  const config = {
    dataPath: protocol + "//" + hostUrl + "/wp-content/feda-map-data" + "/feda.geojson",
    imgPath: protocol + "//" + hostUrl + "/wp-content/feda-map-data" + "/logos" + "/",
  }
  loadMap(config);
}
