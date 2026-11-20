import {DemoTelemetrySource} from './telemetry.js';
import {renderChart} from './charts.js';

// Replace this one source with an authenticated API/WebSocket adapter later.
// UI rendering remains independent from how snapshots are produced.
const source=new DemoTelemetrySource();
const $=id=>document.getElementById(id);
let map=null, selectedId=null, latest=null;
const markers=new Map(), trails=new Map(), positions=new Map();
const toggle=$('demo-toggle');
const number=new Intl.NumberFormat('en');

function selectDevice(id, focus=true) {
  selectedId=id;
  if(!latest) return;
  const device=latest.devices.find(d=>d.id===id);
  document.querySelectorAll('.device-row').forEach(row=>row.setAttribute('aria-pressed',String(row.dataset.id===id)));
  markers.forEach((marker,key)=>marker.getElement()?.classList.toggle('is-selected',key===id));
  if(device) {
    $('selected-device').textContent=`${device.id} · ${device.latitude.toFixed(5)}° N / ${device.longitude.toFixed(5)}° E · Simulated GPS`;
    if(focus && map) {map.setView([device.latitude,device.longitude],15);markers.get(id)?.openPopup();}
  }
}
function fitFleet() {
  if(map && latest) map.fitBounds(latest.devices.map(d=>[d.latitude,d.longitude]),{padding:[45,45],maxZoom:14});
}
function initMap() {
  const message=$('map-message');
  if(!window.L) {
    message.hidden=false;
    message.textContent='Map library unavailable. Check your connection to unpkg.com and reload. The demo and analytics still work.';
    $('fit-map').disabled=true;return;
  }
  map=L.map('fleet-map',{scrollWheelZoom:false}).setView([46.7712,23.610],13);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  tiles.on('tileerror',()=>{message.hidden=false;message.textContent='Some OpenStreetMap tiles could not load. Vehicle positions are still simulated; check your internet connection.';});
  source.snapshot().devices.forEach((d,i)=> {
    const icon=L.divIcon({className:'vehicle-marker',html:`<span class="vehicle-dot" style="--vehicle-color:${d.color}">${String(i+1).padStart(2,'0')}</span>`,iconSize:[32,32],iconAnchor:[16,16]});
    const marker=L.marker([d.latitude,d.longitude],{icon,title:`${d.name} — simulated GPS`,alt:d.name}).addTo(map).bindPopup('Simulated GPS');
    marker.on('click',()=>selectDevice(d.id,false)); markers.set(d.id,marker);
    const point=[d.latitude,d.longitude]; positions.set(d.id,[point]);
    trails.set(d.id,L.polyline([point],{color:d.color,weight:2,opacity:.65}).addTo(map));
  });
  new ResizeObserver(()=>map.invalidateSize()).observe($('fleet-map'));
}
function initDevices() {
  source.snapshot().devices.forEach((d,i)=> {
    const button=document.createElement('button');
    button.type='button';button.className='device-row';button.dataset.id=d.id;
    button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',`Locate ${d.name} on map`);
    button.innerHTML=`<span class="device-icon" style="--vehicle-color:${d.color}">${String(i+1).padStart(2,'0')}</span><span class="device-info"><span class="device-name">${d.name}</span><span class="device-id">${d.id} · GPS NODE</span></span><span class="device-reading"><span class="device-speed"><span data-speed>0</span> <small>km/h</small></span><span class="device-status">Ready</span></span>`;
    button.addEventListener('click',()=>selectDevice(d.id));$('device-list').append(button);
  });
}
function render(state) {
  const newSample=state.timestamp!==latest?.timestamp;
  latest=state;
  toggle.textContent=state.running?'Pause demo':'Start demo';
  toggle.setAttribute('aria-pressed',String(state.running));
  $('demo-state').textContent=state.running?'DEMO RUNNING':'DEMO PAUSED';
  $('kpi-devices').textContent=state.running?'4':'0';
  $('device-caption').textContent=state.running?'4 streaming · simulated':state.events?'Demo paused · 4 devices ready':'Ready to connect · demo';
  const average=state.devices.reduce((n,d)=>n+d.speedKmh,0)/4;
  $('kpi-speed').textContent=average.toFixed(0);
  $('kpi-events').textContent=number.format(state.events);
  const latency=state.events?Math.round(state.devices.reduce((n,d)=>n+d.latencyMs,0)/4):null;
  $('kpi-latency').textContent=latency??'—';
  $('speed-track').style.width=`${Math.min(average/80*100,100)}%`;
  $('event-track').style.width=`${Math.min(state.events/240*100,100)}%`;
  $('latency-track').style.width=`${Math.min((latency??0),100)}%`;
  $('map-status').textContent=state.running?'Streaming simulated GPS':state.events?'Paused · last readings retained':'Awaiting demo start';
  $('last-update').textContent=state.timestamp?`Last update ${new Date(state.timestamp).toLocaleTimeString()}`:'No updates yet';
  $('stream-health').textContent=state.running?'Demo active':'Paused';
  $('stream-health').className=`health-label${state.running?'':' amber'}`;
  state.devices.forEach(d=> {
    const row=document.querySelector(`[data-id="${d.id}"]`);
    row.querySelector('[data-speed]').textContent=d.speedKmh;
    row.querySelector('.device-status').textContent=state.running?'Streaming':state.events?'Paused':'Ready';
    row.querySelector('.device-status').classList.toggle('running',state.running);
    const marker=markers.get(d.id);
    if(marker) {
      const point=[d.latitude,d.longitude];marker.setLatLng(point);
      marker.setPopupContent(`<strong>${d.name}</strong><br>${d.id} · ${d.speedKmh} km/h<br>${d.latitude.toFixed(5)}, ${d.longitude.toFixed(5)}<br>Simulated GPS · ${state.running?'streaming':'paused'}`);
      if(newSample) {const path=positions.get(d.id);path.push(point);if(path.length>120)path.shift();trails.get(d.id).setLatLngs(path);}
    }
  });
  if(selectedId) selectDevice(selectedId,false);
  renderChart($('speed-chart'),state.history,'speed','#ff7849',80);
  renderChart($('events-chart'),state.history,'events','#87b5df',8);
}
async function checkHealth() {
  const label=$('api-health'),button=$('refresh-health');
  button.disabled=true;label.textContent='Checking…';label.className='health-label neutral';
  try {
    const response=await fetch('/health',{cache:'no-store',signal:AbortSignal.timeout(5000)});
    const result=await response.json();
    if(!response.ok || result.status!=='ok') throw new Error('Unhealthy response');
    label.textContent='Healthy';label.className='health-label';
  } catch {label.textContent='Unavailable';label.className='health-label error';}
  finally {button.disabled=false;}
}
initDevices();initMap();source.subscribe(render);
toggle.addEventListener('click',()=>source.running?source.pause():source.start());
$('fit-map').addEventListener('click',fitFleet);
$('refresh-health').addEventListener('click',checkHealth);
window.addEventListener('pagehide',()=>source.pause());
checkHealth();
