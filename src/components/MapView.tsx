import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { env, tileUrl } from '@/lib/env';

L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  label?: string;
  onClick?: () => void;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    // animate:false — an in-flight animation crashes Leaflet if the page unmounts the map.
    if (points.length === 1) map.setView(points[0], 18, { animate: false });
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 19, animate: false });
  }, [map, points]);
  return null;
}

export function MapView({
  points,
  current,
  className = 'h-64',
  fit = true,
}: {
  points: MapPoint[];
  current?: { latitude: number; longitude: number; accuracy?: number } | null;
  className?: string;
  fit?: boolean;
}) {
  const all: [number, number][] = points.map((p) => [p.latitude, p.longitude]);
  if (current) all.push([current.latitude, current.longitude]);
  const center: [number, number] = all[0] ?? [13.7563, 100.5018];
  return (
    <div className={`overflow-hidden rounded-2xl ring-1 ring-slate-200 ${className}`}>
      <MapContainer center={center} zoom={16} className="h-full w-full" scrollWheelZoom>
        <TileLayer url={tileUrl()} attribution={env.mapAttribution} maxZoom={20} />
        {points.map((p) => (
          <Marker key={p.id} position={[p.latitude, p.longitude]} eventHandlers={p.onClick ? { click: p.onClick } : undefined}>
            {p.label && <Popup>{p.label}</Popup>}
          </Marker>
        ))}
        {current && (
          <>
            {current.accuracy !== undefined && <Circle center={[current.latitude, current.longitude]} radius={current.accuracy} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.1 }} />}
            <CircleMarker center={[current.latitude, current.longitude]} radius={8} pathOptions={{ color: 'white', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />
          </>
        )}
        {fit && <FitBounds points={all} />}
      </MapContainer>
    </div>
  );
}
