import { DASHBOARD_PATH } from '../../routes.ts'

export default function Hero() {
    return (
        <section className="sp-hero">
            <div>
                <p className="sp-eyebrow">A second life for your spare phone</p>
                <h1>
                    Your stuff.
                    <br />
                    Your space.
                    <br />
                    <span>A little peace of mind.</span>
                </h1>
                <p className="sp-intro">
                    Meet StayPut. Place a spare phone on your laptop or in your bag, arm it, and get a visual alert
                    when it's picked up.
                </p>
                <div className="sp-actions">
                    <a className="sp-button sp-primary" href={DASHBOARD_PATH}>Open the live dashboard</a>
                    <a className="sp-button sp-secondary" href="#how-it-works">How it works</a>
                </div>
            </div>
            <PhoneScene />
        </section>
    )
}

/** The laptop-and-phone illustration, drawn in CSS. */
function PhoneScene() {
    return (
        <div className="sp-scene" aria-hidden="true">
            <div className="sp-halo"></div>
            <div className="sp-laptop">
                <div className="sp-laptop-screen"></div>
                <div className="sp-laptop-base"></div>
            </div>
            <div className="sp-phone">
                <span className="sp-speaker"></span>
                <span className="sp-phone-shield">S</span>
                <span className="sp-phone-title">STAYPUT</span>
                <span className="sp-phone-status">GUARDING</span>
            </div>
        </div>
    )
}
