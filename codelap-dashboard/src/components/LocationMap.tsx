import { useEffect } from 'react'
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Location } from '../api/types.ts'
import { cardTitle } from '../utils/ui.ts'

const markerIcon = L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#f2545b;border:3px solid #fff;box-shadow:0 0 0 2px #312029"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
})

type LocationMapProps = {
    /** null: no location yet; the map shows the world without a pin. */
    location: Location | null
    label: string
    alert?: boolean
}

const WORLD: [number, number] = [25, 10]
const STREET_ZOOM = 17

export default function LocationMap({ location, label, alert = false }: LocationMapProps) {
    return (
        <section className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-4">
                <h2 className={cardTitle}>{label}</h2>
            </div>
            <div className="min-h-72 w-full flex-1">
                <MapContainer
                    center={location ? [location.lat, location.lon] : WORLD}
                    zoom={location ? STREET_ZOOM : 2}
                    scrollWheelZoom={false}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        // Darkened in index.css, so the map matches the dark dashboard.
                        className="map-tiles-dark"
                    />
                    {location && location.accuracy_m !== null && (
                        <Circle
                            center={[location.lat, location.lon]}
                            radius={location.accuracy_m}
                            pathOptions={{
                                // Leaflet sets SVG attributes, where CSS variables don't work: the palette's alert and accent.
                                color: alert ? '#f2545b' : '#54c3ea',
                                fillOpacity: 0.12,
                            }}
                        />
                    )}
                    {location && (
                        <Marker position={[location.lat, location.lon]} icon={markerIcon}>
                            <Popup>{label}</Popup>
                        </Marker>
                    )}
                    {location && <FollowLocation lat={location.lat} lon={location.lon} />}
                </MapContainer>
            </div>
        </section>
    )
}

/**
 * MapContainer only uses `center` when it first appears: follow the phone as it moves, keeping the user's zoom,
 * except coming from the world view (no location before), which zooms in to street level.
 */
function FollowLocation({ lat, lon }: { lat: number; lon: number }) {
    const map = useMap()
    useEffect(() => {
        if (map.getZoom() < 10) map.setView([lat, lon], STREET_ZOOM)
        else map.panTo([lat, lon])
    }, [map, lat, lon])
    return null
}
