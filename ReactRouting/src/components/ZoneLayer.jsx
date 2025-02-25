import React from 'react';
import { Polygon } from 'react-leaflet';

function ZoneLayer({ zones = [] }) {
  return (
    <>
      {zones.map((zone) => (
        <Polygon
          key={zone.properties?.Name || 'unknown'}
          positions={zone.geometry.coordinates[0].map(coord => [coord[1], coord[0]])}
          pathOptions={{
            fillColor: '#3388ff',
            fillOpacity: 0.2,
            weight: 2,
            opacity: 1,
            color: 'white',
            dashArray: '4 4',
            dashOffset: '0',
            lineCap: 'butt',
            lineJoin: 'round'
          }}
        />
      ))}
    </>
  );
}

export default ZoneLayer;