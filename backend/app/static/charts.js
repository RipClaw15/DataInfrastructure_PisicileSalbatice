/** Small SVG charts: no chart framework, fixed viewBox, bounded history. */
export function renderChart(container, history, key, color, minimumMax) {
  const W=560,H=210,left=42,right=14,top=15,bottom=35;
  const width=W-left-right,height=H-top-bottom;
  const max=Math.max(minimumMax,...history.map(s=>s[key]));
  const y=value=>top+height-(value/max)*height;
  const x=index=>left+index*width/59;
  let svg=`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  for(let i=0;i<=4;i++) {
    const value=max*i/4;
    svg+=`<line class="gridline" x1="${left}" x2="${W-right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end">${Math.round(value)}</text>`;
  }
  if(history.length) {
    if(key==='events') {
      svg+=history.map((s,i)=>`<rect x="${x(i)}" y="${y(s.events)}" width="5" height="${top+height-y(s.events)}" rx="1" fill="${color}" opacity=".8"/>`).join('');
    } else {
      const points=history.map((s,i)=>`${x(i)},${y(s[key])}`).join(' ');
      svg+=`<polygon points="${left},${top+height} ${points} ${x(history.length-1)},${top+height}" fill="${color}" opacity=".08"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
      const last=history.length-1;
      svg+=`<circle cx="${x(last)}" cy="${y(history[last][key])}" r="3" fill="${color}"/>`;
    }
    const first=history[0].second;
    for(let i=0;i<=3;i++) svg+=`<text x="${left+width*i/3}" y="${H-9}" text-anchor="${i===0?'start':i===3?'end':'middle'}">${first+i*20}s</text>`;
    const last=history.at(-1);
    container.setAttribute('aria-label',`${key==='speed'?'Average fleet speed':'Telemetry throughput'}: latest ${last[key].toFixed(1)} ${key==='speed'?'kilometres per hour':'events per update'}. ${history.length} simulated samples.`);
  } else {
    svg+=`<text class="chart-empty" x="${left+width/2}" y="${top+height/2}" text-anchor="middle">Start demo to collect signals</text>`;
  }
  container.innerHTML=svg+'</svg>';
}
