import Hero from '../components/landing/Hero.tsx'
import HowItWorks from '../components/landing/HowItWorks.tsx'
import LandingFooter from '../components/landing/LandingFooter.tsx'
import LandingHeader from '../components/landing/LandingHeader.tsx'
import StatusPreview from '../components/landing/StatusPreview.tsx'
import '../styles/landing.css'

export default function LandingPage() {
    return (
        <div className="sp-root">
            <a className="sp-skip" href="#main">Skip to content</a>
            <div className="sp-page">
                <LandingHeader />
                <main id="main">
                    <Hero />
                    <HowItWorks />
                    <StatusPreview />
                </main>
                <LandingFooter />
            </div>
        </div>
    )
}
