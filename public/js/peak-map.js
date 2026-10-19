/* global L */
// 共用的台灣百岳 Leaflet 地圖
window.PeakMap = (function () {
  const COLORS = { done: '#198754', todo: '#6c757d', selected: '#fd7e14', target: '#0d6efd' };

  function baseLayers() {
    return {
      地形圖: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
      }),
      街道圖: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }),
    };
  }

  function create(el, { height } = {}) {
    if (height) el.style.height = height;
    const map = L.map(el, { scrollWheelZoom: false }).setView([23.75, 121.05], 8);
    const layers = baseLayers();
    layers['地形圖'].addTo(map);
    L.control.layers(layers).addTo(map);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    return map;
  }

  function popupHtml(p) {
    const done = p.done ? `<div class="text-success small">✔ 已完登 ${p.first_date ?? p.done.first_date ?? ''}</div>` : '';
    return `<div class="fw-bold">#${p.no} ${p.name}</div>
      <div class="small">${p.elevation} m｜${p.counties}｜${p.region}</div>${done}
      <div class="small mt-1"><a href="/peaks/${p.no}">詳細資料</a> · <a href="${p.google_maps_url}" target="_blank" rel="noopener">Google 地圖</a></div>`;
  }

  function marker(p, color, radius = 7) {
    return L.circleMarker([p.lat, p.lng], {
      radius,
      color: '#fff',
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.9,
    }).bindTooltip(`#${p.no} ${p.name}`);
  }

  function legend(map, items) {
    const ctl = L.control({ position: 'bottomleft' });
    ctl.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = items.map(([label, color]) => `<span><i style="background:${color}"></i>${label}</span>`).join('');
      return div;
    };
    ctl.addTo(map);
  }

  return { COLORS, create, popupHtml, marker, legend };
})();
