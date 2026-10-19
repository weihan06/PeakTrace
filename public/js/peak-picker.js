/* global $, L, PeakMap */
// 百岳挑選器：select2 下拉 + 台灣地圖點選，雙向同步
window.initPeakPicker = async function ({ select, map: mapEl, preselect = [] }) {
  const peaks = await (await fetch('/api/peaks')).json();
  const $select = $(select);
  const byNo = new Map(peaks.map((p) => [p.no, p]));

  // 依北中南東分組
  const groups = {};
  peaks.forEach((p) => (groups[p.region] ??= []).push(p));
  for (const [region, list] of Object.entries(groups)) {
    const $g = $('<optgroup>').attr('label', `${region}（${list.length}）`);
    list.forEach((p) => {
      $g.append(new Option(`#${p.no} ${p.name}`, p.no, false, preselect.includes(p.no)));
    });
    $select.append($g);
  }

  const fmt = (opt) => {
    if (!opt.id) return opt.text;
    const p = byNo.get(Number(opt.id));
    const done = p.done ? '<span class="badge text-bg-success ms-1">已完登</span>' : '';
    return $(`<span><b>#${p.no}</b> ${p.name} <small class="text-body-secondary">${p.elevation}m · ${p.counties}</small>${done}</span>`);
  };
  $select.select2({
    theme: 'bootstrap-5',
    width: '100%',
    placeholder: '輸入山名、編號或縣市搜尋…',
    closeOnSelect: false,
    templateResult: fmt,
    matcher(params, data) {
      if (!params.term || !data.id) return data.children ? filterGroup(params, data) : data;
      const p = byNo.get(Number(data.id));
      const hay = `${p.no} ${p.name} ${p.counties} ${p.region} ${p.range_name} ${p.route}`;
      return hay.includes(params.term.trim()) ? data : null;
    },
  });
  function filterGroup(params, data) {
    if (!params.term) return data;
    const children = data.children.filter((c) => {
      const p = byNo.get(Number(c.id));
      return `${p.no} ${p.name} ${p.counties} ${p.region} ${p.range_name} ${p.route}`.includes(params.term.trim());
    });
    return children.length ? $.extend({}, data, { children }) : null;
  }

  if (!mapEl) return;
  const map = PeakMap.create(mapEl);
  const markers = new Map();
  const selected = () => new Set(($select.val() || []).map(Number));

  function paint() {
    const sel = selected();
    markers.forEach((m, no) => {
      const p = byNo.get(no);
      const color = sel.has(no) ? PeakMap.COLORS.selected : p.done ? PeakMap.COLORS.done : PeakMap.COLORS.todo;
      m.setStyle({ fillColor: color });
      m.setRadius(sel.has(no) ? 10 : 7);
      if (sel.has(no)) m.bringToFront();
    });
  }

  peaks.filter((p) => p.lat != null).forEach((p) => {
    const m = PeakMap.marker(p, PeakMap.COLORS.todo).addTo(map);
    m.on('click', () => {
      const sel = selected();
      sel.has(p.no) ? sel.delete(p.no) : sel.add(p.no);
      $select.val([...sel].map(String)).trigger('change');
    });
    markers.set(p.no, m);
  });
  PeakMap.legend(map, [['已選擇', PeakMap.COLORS.selected], ['已完登', PeakMap.COLORS.done], ['未完登', PeakMap.COLORS.todo]]);

  $select.on('select2:select', (e) => {
    const p = byNo.get(Number(e.params.data.id));
    if (p?.lat != null) map.panTo([p.lat, p.lng]);
  });
  $select.on('change', paint);
  paint();
};
