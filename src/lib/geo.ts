import type { PublicIpLocation } from '@/types/geo';

/**
 * ISO 3166-1 alpha-2 to its flag emoji, by offsetting each letter into the
 * regional-indicator block. Anything that is not exactly two ASCII letters —
 * including the providers that return an empty or non-standard code — yields no
 * flag rather than a pair of stray glyphs.
 */
export function flagFromCountryCode(code: string | undefined): string {
    if (!code || !/^[A-Za-z]{2}$/.test(code)) {
        return '';
    }

    return String.fromCodePoint(
        ...[...code.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65)
    );
}

/**
 * Whether this location can actually be plotted.
 *
 * Both coordinates must be present and finite before anything is drawn: `0, 0`
 * is a real point in the Gulf of Guinea, so a half-filled lookup must not put a
 * marker there.
 */
export function hasCoordinates(
    location: PublicIpLocation | null | undefined
): location is PublicIpLocation & { latitude: number; longitude: number } {
    return (
        typeof location?.latitude === 'number'
        && typeof location?.longitude === 'number'
        && Number.isFinite(location.latitude)
        && Number.isFinite(location.longitude)
    );
}

/** `City, Country`, falling back through the coarser fields a provider returned. */
export function locationLabel(location: PublicIpLocation | null | undefined): string {
    if (!location) {
        return '';
    }

    const cityCountry = [location.city, location.country]
        .filter((part) => !!part?.trim())
        .join(', ');

    return cityCountry || location.region || location.continent || '';
}

/** Fixed to 3 decimals — ~100 m, which already flatters city-level accuracy. */
export function coordinateLabel(location: PublicIpLocation | null | undefined): string {
    return hasCoordinates(location)
        ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
        : '';
}
