import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Location } from '../api/types.ts'

const markerIcon = L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 0 0 2px #dc2626"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
})

type LocationMapProps = {
    location: Location
    label: string
    alert?: boolean
}

export default function LocationMap({ location, label, alert = false }: LocationMapProps) {
    return (
        <section className="overflow-hidden rounded-xl border border-line bg-card">
            <div className="flex items-center justify-between px-4 py-2">
                <h2 className="text-muted">{label}</h2>
                <span className="text-xs text-muted tabular-nums">
                    {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
                    {location.accuracy_m !== null && ` · ±${Math.round(location.accuracy_m)} m`}
                </span>
            </div>
            <div className="h-64 w-full">
                <MapContainer
                    center={[location.lat, location.lon]}
                    zoom={17}
                    scrollWheelZoom={false}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {location.accuracy_m !== null && (
                        <Circle
                            center={[location.lat, location.lon]}
                            radius={location.accuracy_m}
                            pathOptions={{
                                color: alert ? '#dc2626' : '#3e63dd',
                                fillOpacity: 0.12,
                            }}
                        />
                    )}
                    <Marker position={[location.lat, location.lon]} icon={markerIcon}>
                        <Popup>{label}</Popup>
                    </Marker>
                </MapContainer>
            </div>
        </section>
    )
}