/** Browser-only demo source. No network requests, persistence, or real location access.
 * Future adapters should implement subscribe(listener), start(), pause(), snapshot().
 * Snapshot: {running, events, elapsedSeconds, timestamp, devices, history}.
 * Device: {id, name, color, latitude, longitude, speedKmh, latencyMs}.
 */
export const UPDATE_INTERVAL_MS = 1000;
export const HISTORY_LIMIT = 60;
const ROUTES = [
  [[46.7694,23.5893],[46.7694,23.5967],[46.7705,23.6000],[46.7732,23.6006],[46.7750,23.5900],[46.7721,23.5853]],
  [[46.7778,23.5997],[46.7771,23.6083],[46.7751,23.6155],[46.7713,23.6130],[46.7735,23.6030]],
  [[46.7715,23.6221],[46.7737,23.6298],[46.7748,23.6370],[46.7700,23.6400],[46.7665,23.6320],[46.7677,23.6230]],
  [[46.7630,23.5760],[46.7642,23.5850],[46.7649,23.5940],[46.7603,23.5960],[46.7580,23.5850],[46.7600,23.5760]],
];
const definitions = [
  ['FP-001','Vehicle Alpha','#ff7849'], ['FP-002','Vehicle Bravo','#87b5df'],
  ['FP-003','Vehicle Charlie','#9bd5b2'], ['FP-004','Vehicle Delta','#c4a4df'],
];
export function distanceMeters(a, b) {
  const rad = x => x * Math.PI / 180;
  const lat = rad(b[0] - a[0]), lon = rad(b[1] - a[1]);
  const h = Math.sin(lat/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(lon/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
export class DemoTelemetrySource {
  constructor() {
    this.running = false; this.timer = null; this.events = 0;
    this.elapsedSeconds = 0; this.timestamp = null; this.history = []; this.listeners = new Set();
    this.devices = definitions.map(([id,name,color], i) => ({id,name,color,
      latitude:ROUTES[i][0][0],longitude:ROUTES[i][0][1],speedKmh:0,latencyMs:null,target:1}));
  }
  snapshot() {
    return {running:this.running,events:this.events,elapsedSeconds:this.elapsedSeconds,timestamp:this.timestamp,
      devices:this.devices.map(({target,...device}) => ({...device})),history:this.history.map(sample=>({...sample}))};
  }
  subscribe(listener) { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  emit() { const state=this.snapshot(); this.listeners.forEach(listener=>listener(state)); }
  start() {
    if (this.running) return;
    this.running=true; this.emit();
    this.timer=setInterval(()=>this.tick(),UPDATE_INTERVAL_MS);
  }
  pause() { clearInterval(this.timer); this.timer=null; this.running=false; this.emit(); }
  tick() {
    this.elapsedSeconds++;
    this.timestamp=new Date().toISOString();
    this.devices.forEach((device,i)=> {
      device.speedKmh=Math.round(32+i*5+10*Math.sin(this.elapsedSeconds/11+i));
      device.latencyMs=Math.round(28+i*2+6*Math.sin(this.elapsedSeconds/7+i));
      let remaining=device.speedKmh/3.6;
      // Follow closed, illustrative GPS paths; these are not road-matched routes.
      while (remaining>0) {
        const route=ROUTES[i], target=route[device.target];
        const from=[device.latitude,device.longitude];
        const distance=distanceMeters(from,target);
        if(distance<=remaining) {
          [device.latitude,device.longitude]=target;
          device.target=(device.target+1)%route.length; remaining-=distance;
        } else {
          const ratio=remaining/distance;
          device.latitude+=(target[0]-device.latitude)*ratio;
          device.longitude+=(target[1]-device.longitude)*ratio; remaining=0;
        }
      }
    });
    this.events+=this.devices.length;
    this.history.push({second:this.elapsedSeconds,speed:this.devices.reduce((sum,d)=>sum+d.speedKmh,0)/this.devices.length,events:this.devices.length});
    if(this.history.length>HISTORY_LIMIT) this.history.shift();
    this.emit();
  }
}
