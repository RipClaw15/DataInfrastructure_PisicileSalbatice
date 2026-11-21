// Same-origin API reads only. No device controls, credentials, or simulated data.
const $ = (id) => document.getElementById(id);
const POLL_MS = 2000;
const REQUEST_TIMEOUT_MS = 8000;
const controllers = new Set();
let timer;
let generation = 0;
let selectedDevice = '';
let lastUpdated = null;

function text(id, value) { $(id).textContent = value; }
function localTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}
function localDate(value) { return value ? new Date(value).toLocaleString() : '—'; }
function fixed(value) { return Number.isFinite(value) ? value.toFixed(3) : '—'; }

function notice(id, message) {
  text(id, message);
  $(id).hidden = !message;
}

function connection(label, mode = '') {
  text('connection-label', label);
  $('connection-label').dataset.mode = mode;
}

async function getJSON(path) {
  const controller = new AbortController();
  controllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    controllers.delete(controller);
  }
}

function cancelPending() {
  clearTimeout(timer);
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
}

function updateDevices(events) {
  const ids = [...new Set(events.map((event) => event.device_id))];
  if (!selectedDevice && ids.length) selectedDevice = ids[0];
  const options = [...ids];
  // Keep a chosen phone selectable if newer phones fill the 500-reading window.
  if (selectedDevice && !options.includes(selectedDevice)) options.push(selectedDevice);
  const select = $('device-select');
  const currentOptions = [...select.options].map((option) => option.value);
  if (options.join('|') !== currentOptions.join('|')) {
    select.replaceChildren();
    if (!options.length) select.add(new Option('Waiting for readings', ''));
    options.forEach((id) => select.add(new Option(id, id)));
  }
  select.value = selectedDevice;
  select.disabled = !options.length;
  text('device-count', `${ids.length} ${ids.length === 1 ? 'phone' : 'phones'} in the latest ${events.length} readings`);
}

function renderStatus(status) {
  const descriptions = {
    GUARDING: 'Phone resting. Watching for a change in orientation.',
    ALERT: 'Phone moved. The alert stays on until you disarm.',
    DISARMED: 'Not guarding. Arm this phone from the mobile app.',
  };
  $('guard-card').dataset.state = status?.state || 'UNKNOWN';
  text('guard-state', status ? { GUARDING: 'Guarding', ALERT: 'Picked up', DISARMED: 'Disarmed' }[status.state] : selectedDevice ? 'Status unavailable' : 'Waiting for data');
  text('guard-description', status ? descriptions[status.state] : selectedDevice ? 'Readings are shown below. Guard status could not be loaded.' : 'Send a reading from the phone app to get started.');
  text('phone-online', status ? status.online ? 'Online' : 'Offline · no recent readings' : '—');
  text('armed-at', localTime(status?.armed_at));
  $('armed-at').title = localDate(status?.armed_at);
}

function renderLatest(events) {
  const latest = events[0];
  text('magnitude', fixed(latest?.value));
  for (const axis of ['x', 'y', 'z']) text(`axis-${axis}`, fixed(latest?.axes[axis]));
  text('latest-time', localTime(latest?.timestamp));
  text('latest-date', latest ? new Date(latest.timestamp).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : 'No readings in the current window');
  text('received-at', localTime(latest?.received_at));
  $('received-at').title = localDate(latest?.received_at);
  text('reading-count', String(events.length));
}

function cell(value, title) {
  const element = document.createElement('td');
  element.textContent = value;
  if (title) element.title = title;
  return element;
}

function renderReadings(events) {
  const rows = events.slice(0, 50).map((event) => {
    const row = document.createElement('tr');
    row.append(cell(`#${event.id}`), cell(localTime(event.timestamp), localDate(event.timestamp)),
      cell(`${fixed(event.value)} g`), ...['x', 'y', 'z'].map((axis) => cell(fixed(event.axes[axis]))),
      cell(localTime(event.received_at), localDate(event.received_at)));
    return row;
  });
  $('readings-body').replaceChildren(...rows);
  $('readings-table').hidden = !rows.length;
  $('readings-empty').hidden = rows.length > 0;
}

function svgElement(name, attributes, content) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (content !== undefined) element.textContent = content;
  return element;
}

function renderChart(events) {
  const samples = events.slice(0, 120).reverse();
  $('motion-chart').hidden = !samples.length;
  $('chart-empty').hidden = samples.length > 0;
  if (!samples.length) {
    text('chart-start', '—');
    text('chart-end', '—');
    text('chart-caption', 'Up to 120 readings for this phone');
    return;
  }
  const left = 55, right = 985, top = 15, bottom = 220;
  const max = Math.max(1.2, ...samples.map((event) => event.value)) * 1.1;
  const first = new Date(samples[0].timestamp).getTime();
  const last = new Date(samples.at(-1).timestamp).getTime();
  const points = samples.map((event, index) => {
    const x = last === first ? left + (right - left) * index / Math.max(1, samples.length - 1)
      : left + (right - left) * (new Date(event.timestamp).getTime() - first) / (last - first);
    return [x, bottom - (bottom - top) * event.value / max];
  });
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const y = bottom - (bottom - top) * i / 4;
    grid.push(svgElement('line', { x1: left, x2: right, y1: y, y2: y, class: 'chart-grid-line' }));
    grid.push(svgElement('text', { x: left - 12, y: y + 5, 'text-anchor': 'end', class: 'chart-axis-label' }, (max * i / 4).toFixed(1)));
  }
  $('chart-grid').replaceChildren(...grid);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  $('chart-line').setAttribute('d', path);
  $('chart-area').setAttribute('d', `${path} L${points.at(-1)[0]},${bottom} L${points[0][0]},${bottom} Z`);
  $('chart-points').replaceChildren(...(points.length === 1 ? [svgElement('circle', { cx: points[0][0], cy: points[0][1], r: 4, class: 'chart-point' })] : []));
  text('chart-start', localTime(samples[0].timestamp));
  text('chart-end', localTime(samples.at(-1).timestamp));
  text('chart-caption', `${samples.length} ${samples.length === 1 ? 'reading' : 'readings'} · taken at phone time`);
  text('chart-description', `${samples.length} accelerometer readings for ${selectedDevice}. Latest magnitude ${fixed(samples.at(-1).value)} g. Peak ${fixed(Math.max(...samples.map((event) => event.value)))} g.`);
}

function renderAlerts(alerts, available = true) {
  const items = alerts.map((alert) => {
    const item = document.createElement('li');
    item.className = 'alert-item';
    const details = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'alert-name';
    name.textContent = 'Phone picked up';
    const subtitle = document.createElement('span');
    subtitle.className = 'alert-detail';
    subtitle.textContent = `${localDate(alert.timestamp)} · ${fixed(alert.value)} g · alert #${alert.id}`;
    details.append(name, subtitle);
    const angle = document.createElement('span');
    angle.className = 'alert-angle';
    angle.textContent = `${alert.angle_deg.toFixed(1)}°`;
    angle.title = 'Angle from the armed resting position';
    item.append(details, angle);
    return item;
  });
  $('alert-list').replaceChildren(...items);
  text('alert-count', available ? `${alerts.length} RECENT ${alerts.length === 1 ? 'ALERT' : 'ALERTS'}` : 'UNAVAILABLE');
  text('alerts-empty', available ? selectedDevice ? 'No alerts recorded for this phone.' : 'Send a reading to discover a phone.' : 'Alert history could not be loaded. Retrying automatically.');
  $('alerts-empty').hidden = items.length > 0;
}

async function refresh() {
  cancelPending();
  const current = ++generation;
  $('refresh').disabled = true;
  try {
    const data = await getJSON('/api/events?limit=500');
    if (current !== generation) return;
    if (!Array.isArray(data.events)) throw new Error('Unexpected events response');
    updateDevices(data.events);
    const events = data.events.filter((event) => event.device_id === selectedDevice);
    renderLatest(events);
    renderReadings(events);
    renderChart(events);
    let guardAvailable = true;
    if (selectedDevice) {
      const device = encodeURIComponent(selectedDevice);
      const [status, alerts] = await Promise.allSettled([
        getJSON(`/api/devices/${device}/status`), getJSON(`/api/devices/${device}/alerts?limit=20`),
      ]);
      if (current !== generation) return;
      renderStatus(status.status === 'fulfilled' ? status.value : null);
      const hasAlerts = alerts.status === 'fulfilled' && Array.isArray(alerts.value.alerts);
      renderAlerts(hasAlerts ? alerts.value.alerts : [], hasAlerts);
      guardAvailable = status.status === 'fulfilled' && hasAlerts;
    } else {
      renderStatus(null);
      renderAlerts([]);
    }
    notice('guard-notice', guardAvailable ? '' : 'Readings are connected, but guard status or alert history is unavailable. Retrying automatically.');
    notice('error-banner', '');
    connection(guardAvailable ? 'Connected · auto refresh' : 'Connected · partial data', guardAvailable ? '' : 'paused');
    lastUpdated = new Date();
    text('updated-at', `Updated ${lastUpdated.toLocaleTimeString()}`);
  } catch (error) {
    if (current !== generation) return;
    connection('Connection unavailable', 'error');
    notice('error-banner', `Could not load readings (${error.name === 'AbortError' ? 'request timed out' : error.message}). ${lastUpdated ? 'Showing the last successful update; the values may be stale.' : 'No live data has loaded yet.'} Retrying automatically.`);
  } finally {
    if (current === generation) {
      $('refresh').disabled = false;
      if (!document.hidden) timer = setTimeout(refresh, POLL_MS);
    }
  }
}

$('refresh').addEventListener('click', refresh);
$('device-select').addEventListener('change', () => {
  selectedDevice = $('device-select').value;
  // Clear the previous phone's values while loading the newly selected one.
  renderStatus(null);
  renderLatest([]);
  renderReadings([]);
  renderChart([]);
  renderAlerts([]);
  refresh();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    generation++;
    cancelPending();
    $('refresh').disabled = false;
    connection('Updates paused · tab hidden', 'paused');
    text('polling-note', 'Updates resume when this tab is visible.');
  } else {
    text('polling-note', 'Refreshes every 2 seconds while visible.');
    refresh();
  }
});
window.addEventListener('pagehide', () => { generation++; cancelPending(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) refresh(); });
if (!document.hidden) refresh();
