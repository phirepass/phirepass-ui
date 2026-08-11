import { Globe } from 'lucide-react';

import { cn } from '@/lib/utils';
import { coordinateLabel, flagFromCountryCode } from '@/lib/geo';
import type { PublicIpLocation } from '@/types/geo';

/**
 * `Greece (GR)`, or whichever half the provider actually returned — the code
 * alone is still worth showing, since it is what the flag is derived from.
 */
function countryLabel(location: PublicIpLocation): string {
    const name = location.country?.trim();
    const code = location.country_code?.trim().toUpperCase();

    if (name && code) {
        return `${name} (${code})`;
    }

    return name || code || '';
}

export interface LocationDetailsProps {
    location: PublicIpLocation | null | undefined;
    /** Masks the address and coordinates, matching the card's IP blur. */
    blurred?: boolean;
    className?: string;
}

/**
 * Everything the geolocation lookup returned, as a two-column definition list.
 * Empty fields are dropped rather than shown blank — provider coverage varies,
 * and a column of "—" reads as broken.
 */
export function LocationDetails({ location, blurred = false, className }: LocationDetailsProps) {
    if (!location) {
        return null;
    }

    const flag = flagFromCountryCode(location.country_code);

    // Every field the lookup carries, ordered address-first then coarsening
    // outwards from the city. `is_proxy` is the one row worth printing as "No",
    // because an explicit negative is an answer — the rest are dropped when the
    // provider had nothing for them.
    const rows = [
        { label: 'IP address', value: blurred ? '••••••••' : location.ip, mono: true },
        { label: 'Reverse DNS', value: location.hostname, mono: true },
        { label: 'Coordinates', value: blurred ? '••••••••' : coordinateLabel(location), mono: true },
        { label: 'City', value: location.city },
        { label: 'Region', value: location.region },
        { label: 'Postal code', value: location.postal_code, mono: true },
        { label: 'Country', value: countryLabel(location), flag },
        { label: 'Continent', value: location.continent },
        { label: 'Timezone', value: location.time_zone },
        { label: 'ASN', value: location.asn, mono: true },
        { label: 'Network', value: location.asn_org },
        {
            label: 'Proxy or VPN',
            value: typeof location.is_proxy === 'boolean' ? (location.is_proxy ? 'Yes' : 'No') : '',
        },
    ].filter((row) => !!row.value);

    return (
        <div className={className}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {rows.map((row) => (
                    <div key={row.label} className="min-w-0">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className={cn('truncate text-foreground', row.mono && 'font-mono')}>
                            {row.flag ? <span aria-hidden="true">{row.flag} </span> : null}
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>

            {location.is_proxy ? (
                <p className="mt-3 flex items-center gap-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    This address is flagged as a proxy or VPN, so the location may be the exit
                    node&apos;s rather than the host&apos;s.
                </p>
            ) : null}
        </div>
    );
}
