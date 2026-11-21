const STEPS = [
    {
        label: 'Set up',
        title: 'Give your phone a job.',
        text: 'Open the mobile app and place the phone on the things you want to keep an eye on.',
    },
    {
        label: 'Arm',
        title: 'Let it settle.',
        text: 'Tap Arm and step back. Once the phone lies still, it starts watching.',
    },
    {
        label: 'Watch',
        title: 'Know when it moves.',
        text: "If someone picks it up, you'll know right away. The alarm stays on until you disarm it.",
    },
]

export default function HowItWorks() {
    return (
        <section id="how-it-works" className="sp-section">
            <p className="sp-eyebrow">Simple by design</p>
            <h2>Put it down. Arm it. Stay informed.</h2>
            <div className="sp-steps">
                {STEPS.map((step) => (
                    <article key={step.label}>
                        <span className="sp-step-label">{step.label}</span>
                        <h3>{step.title}</h3>
                        <p>{step.text}</p>
                    </article>
                ))}
            </div>
        </section>
    )
}
