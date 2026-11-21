import type { CSSProperties } from 'react'
import type { GuardState } from '../api/types.ts'
import { angleBetween, poseMatrix, type Axes } from '../utils/orientation.ts'

type PhoneTiltProps = {
    state: GuardState
    
    rest: Axes | null
    
    current: Axes | null
}


const FLAT: Axes = { x: 0, y: 0, z: -1 }


const W = 60
const H = 120
const D = 8


export default function PhoneTilt({ state, rest, current }: PhoneTiltProps) {
    const pose = current ?? rest ?? FLAT
    const angle = rest && current ? Math.round(angleBetween(rest, current)) : null
    const label = angle === null ? null : angle <= 2 ? 'Where it lay' : `${angle}° from where it lay`

    return (
        <figure className="flex shrink-0 flex-col items-center gap-2" aria-label={label ?? undefined}>
            <div className="grid h-40 w-44 place-items-center sm:h-48 sm:w-56 [perspective:700px]" aria-hidden="true">
                
                <div className="relative [transform-style:preserve-3d] [transform:rotateX(-38deg)_rotateY(32deg)]">
                    <div
                        className="absolute size-48 rounded-full border border-line bg-page/50"
                        style={{ left: -96, top: -96, transform: `rotateX(90deg) translateZ(${-(D / 2 + 1)}px)` }}
                    />
                    {rest && state !== 'DISARMED' && <Phone pose={poseMatrix(rest)} ghost />}
                    <Phone pose={poseMatrix(pose)} />
                </div>
            </div>
            {label && state !== 'DISARMED' && <figcaption className="text-base font-semibold">{label}</figcaption>}
        </figure>
    )
}

function Phone({ pose, ghost = false }: { pose: string; ghost?: boolean }) {
    const face = (style: CSSProperties, fill = 'bg-card') => (
        <div className={`absolute border border-current/70 ${fill}`} style={{ ...style, backfaceVisibility: 'visible' }} />
    )
    const screen = { width: W, height: H, left: -W / 2, top: -H / 2, borderRadius: 10 }

    
    if (ghost) {
        return (
            <div className="absolute [transform-style:preserve-3d]" style={{ transform: pose }}>
                <div className="absolute border-2 border-dashed border-muted/70" style={{ ...screen, transform: `translateZ(${-D / 2}px)` }} />
            </div>
        )
    }

    return (
        <div
            className="absolute [transform-style:preserve-3d] transition-transform duration-700 ease-out motion-reduce:transition-none"
            style={{ transform: pose }}
        >
            
            {face({ ...screen, transform: `translateZ(${D / 2}px)` }, 'bg-current/20')}
            {face({ ...screen, transform: `rotateY(180deg) translateZ(${D / 2}px)` })}
            
            {face({ width: D, height: H, left: -D / 2, top: -H / 2, transform: `rotateY(90deg) translateZ(${W / 2}px)` })}
            {face({ width: D, height: H, left: -D / 2, top: -H / 2, transform: `rotateY(-90deg) translateZ(${W / 2}px)` })}
            
            {face({ width: W, height: D, left: -W / 2, top: -D / 2, transform: `rotateX(90deg) translateZ(${H / 2}px)` })}
            {face({ width: W, height: D, left: -W / 2, top: -D / 2, transform: `rotateX(-90deg) translateZ(${H / 2}px)` })}
            
            <div
                className="absolute rounded-full bg-current"
                style={{ width: 16, height: 4, left: -8, top: -H / 2 + 9, transform: `translateZ(${D / 2 + 0.5}px)` }}
            />
        </div>
    )
}
