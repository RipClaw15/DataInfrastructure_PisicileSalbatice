import { useState } from 'react'
import './stayput.css'

const PREVIEWS = {
  DISARMED: { title: 'Disarmed', description: 'Taking a break. The phone is not guarding.' },
  GUARDING: { title: 'Guarding', description: 'Phone resting. Watching for a change in orientation.' },
  ALERT: { title: 'Picked up', description: 'Movement detected. The alert stays on until disarmed.' },
} as const

// Presentation only. No API calls or real device controls.
export default function StayPutLanding() {
  const [mode, setMode] = useState<keyof typeof PREVIEWS>('GUARDING')
  const preview = PREVIEWS[mode]

  return (
    <>
  <a className="sp-skip" href="#main">Skip to content</a>
  <div className="sp-page">
    <header className="sp-header">
      <a className="sp-brand" href="#" aria-label="StayPut home"><span className="sp-mark" aria-hidden="true">S</span>StayPut<span className="sp-prototype">PROTOTYPE</span></a>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#preview">Status preview</a></nav>
      <div className="sp-event"><img src="https://upload.wikimedia.org/wikipedia/commons/b/b7/Porsche_Wordmark_Logo_Black.svg" width="1800" height="120" alt="Porsche" /><span>HACKATHON PROJECT</span></div>
    </header>
    <main id="main">
      <section className="sp-hero">
        <div><p className="sp-eyebrow">A SECOND LIFE FOR YOUR SPARE PHONE</p><h1>Your stuff.<br />Your space.<br /><span>A little peace of mind.</span></h1><p className="sp-intro">Meet StayPut. Place a spare phone on your laptop or in your bag, arm it, and get a visual alert when it's picked up.</p><div className="sp-actions"><a className="sp-button sp-primary" href="#preview">Explore the preview</a><a className="sp-button sp-secondary" href="#how-it-works">How it works</a></div><p className="sp-note">Built by Pisicile Sălbatice · Porsche Hackathon 2026</p></div>
        <div className="sp-scene" aria-hidden="true"><span className="sp-scene-label">LESS HARDWARE. MORE POSSIBILITY.</span><div className="sp-halo"></div><div className="sp-laptop"><div className="sp-laptop-screen"></div><div className="sp-laptop-base"></div></div><div className="sp-phone"><span className="sp-speaker"></span><span className="sp-phone-shield">S</span><span className="sp-phone-title">STAYPUT</span><span className="sp-phone-status">GUARDING</span><span className="sp-phone-caption">Concept illustration</span></div><span className="sp-scene-caption">A PHONE WITH A NEW PURPOSE.</span></div>
      </section>
      <section id="how-it-works" className="sp-section"><p className="sp-eyebrow">SIMPLE BY DESIGN</p><h2>Put it down. Arm it. Stay informed.</h2><div className="sp-steps"><article><span className="sp-step-label">SET UP</span><h3>Give your phone a job.</h3><p>Open the mobile app and place the phone on the things you want to keep an eye on.</p></article><article><span className="sp-step-label">ARM</span><h3>Let it settle.</h3><p>The app waits until the phone lies still, then sends readings while it's armed and open.</p></article><article><span className="sp-step-label">WATCH</span><h3>Know when it moves.</h3><p>A change in orientation raises a picked-up alert. The alert stays on until you disarm.</p></article></div></section>
      <section id="preview" className="sp-section sp-preview-section" aria-labelledby="preview-title"><div className="sp-preview-copy"><p className="sp-eyebrow">A GLIMPSE OF THE EXPERIENCE</p><h2 id="preview-title">One phone.<br />Three clear states.</h2><p>See how the guard status will look. Choose a state to explore the interface.</p><p className="sp-preview-disclaimer"><strong>Interface preview only.</strong> These controls do not arm a phone, track a device, or connect to the server.</p></div><div className="sp-preview-card"><div className="sp-preview-top"><span>GUARD STATUS</span><span className="sp-sample-tag">SAMPLE DATA</span></div><div className="sp-preview-status" data-mode={mode} role="status" aria-live="polite" aria-atomic="true"><span className="sp-status-symbol" aria-hidden="true">◈</span><h3 id="preview-state">{preview.title}</h3><p id="preview-description">{preview.description}</p></div><div className="sp-state-buttons" role="group" aria-label="Preview a guard state"><button type="button" onClick={() => setMode('DISARMED')} aria-pressed={mode === 'DISARMED'}>Disarmed</button><button type="button" onClick={() => setMode('GUARDING')} aria-pressed={mode === 'GUARDING'}>Guarding</button><button type="button" onClick={() => setMode('ALERT')} aria-pressed={mode === 'ALERT'}>Alert</button></div></div></section>
      <section className="sp-project-note"><div><p className="sp-eyebrow">WHERE WE ARE TODAY</p><h2>A working mobile prototype.<br />A connected experience in progress.</h2></div><p>The mobile app and local test server can detect a phone being picked up. This website is the presentation layer; cloud telemetry, storage, and the live guard dashboard are the next integration step.</p></section>
    </main>
    <footer className="sp-footer"><a className="sp-brand" href="#">StayPut</a><p>An old phone that guards your stuff.</p><span>Pisicile Sălbatice / 2026</span></footer>
  </div>
    </>
  )
}
