'use client';

import { useEffect, useRef } from 'react';
// Named imports only: maplibre-gl v6 dropped the default export.
import {
    Map as MapLibreMap,
    Marker,
    NavigationControl,
    Popup,
    type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Raster OpenStreetMap, declared inline rather than fetched from a style host,
 * so the map needs no API key and no third-party style server.
 *
 * `attribution` is not optional decoration — the OSM tile usage policy requires
 * visible credit, and MapLibre renders it from this field via the attribution
 * control. Keep `maxzoom` at OSM's real limit (19); asking for deeper tiles just
 * produces 404s against a service run on donations.
 */
const OSM_STYLE: StyleSpecification = {
    version: 8,
    sources: {
        osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/**
 * City-level. The coordinates come from an IP geolocation lookup, so they are
 * accurate to a city at best — zooming to street level would imply a precision
 * the data does not have.
 */
const DEFAULT_ZOOM = 9;

export interface NodeLocationDetailMapProps {
    latitude: number;
    longitude: number;
    label?: string;
    className?: string;
}

/**
 * The interactive half of the location UI: a real OSM map, mounted only while a
 * node's location dialog is open.
 *
 * One instance at a time is the whole design constraint. MapLibre is WebGL, and
 * browsers cap concurrent WebGL contexts (~16 in Chrome), so a map per card in
 * the node grid would start dropping contexts as soon as the grid grew. The
 * always-visible per-card locator is `<NodeLocationMap>`, which is plain SVG and
 * costs nothing to repeat; this one trades that for pan, zoom and real detail.
 */
export function NodeLocationDetailMap({
    latitude,
    longitude,
    label,
    className,
}: NodeLocationDetailMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const map = new MapLibreMap({
            container,
            style: OSM_STYLE,
            center: [longitude, latitude],
            zoom: DEFAULT_ZOOM,
            attributionControl: { compact: true },
        });

        map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

        const marker = new Marker({ color: '#10b981' }).setLngLat([longitude, latitude]);
        if (label) {
            marker.setPopup(new Popup({ offset: 24 }).setText(label));
        }
        marker.addTo(map);

        mapRef.current = map;

        // The dialog animates open, so the container has its final size only
        // after the transition; without this the canvas keeps the size it was
        // measured at on mount and renders letterboxed.
        const observer = new ResizeObserver(() => map.resize());
        observer.observe(container);

        return () => {
            observer.disconnect();
            marker.remove();
            // Releases the WebGL context — the reason only one of these mounts.
            map.remove();
            mapRef.current = null;
        };
    }, [latitude, longitude, label]);

    return <div ref={containerRef} className={className} />;
}
