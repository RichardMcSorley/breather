"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Fix for default marker icon in Next.js
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface CustomerLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

interface MapContentProps {
  locations: CustomerLocation[];
}

export default function MapContent({ locations }: MapContentProps) {
  if (locations.length === 0) {
    return null;
  }

  // Calculate center point of all locations
  const centerLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
  const centerLon = locations.reduce((sum, loc) => sum + loc.lon, 0) / locations.length;

  return (
    <MapContainer
      center={[centerLat, centerLon]}
      zoom={locations.length === 1 ? 13 : 10}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((location) => (
        <Marker key={location.id} position={[location.lat, location.lon]} icon={defaultIcon}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold text-gray-900">{location.name}</div>
              <div className="text-gray-600 mt-1">{location.address}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

