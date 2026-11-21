import { DASHBOARD_PATH } from '../../routes.ts'

export default function LandingHeader() {
    return (
        <header className="sp-header">
            <a className="sp-brand" href="#" aria-label="StayPut home">
                <span className="sp-mark" aria-hidden="true">S</span>
                StayPut
            </a>
            <nav aria-label="Main navigation">
                <a href="#how-it-works">How it works</a>
                <a href={DASHBOARD_PATH}>Live dashboard</a>
            </nav>
            <div className="sp-event">
                <img
                    src="https://upload.wikimedia.org/wikipedia/commons/b/b7/Porsche_Wordmark_Logo_Black.svg"
                    width="1800"
                    height="120"
                    alt="Porsche"
                />
                <span>Hackathon project</span>
            </div>
        </header>
    )
}
