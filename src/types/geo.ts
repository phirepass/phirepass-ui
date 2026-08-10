/**
 * Geolocation of a public IP address, as resolved by a lookup provider.
 *
 * Shared rather than per-feature: a node reports the address its agent dialled
 * out from, an uptime monitor resolves the address it is probing, and both want
 * the same fields rendered the same way. Everything past `ip` is optional
 * because coverage differs per provider — and a private or unroutable target has
 * no public location at all.
 */
export interface PublicIpLocation {
    ip: string;
    hostname?: string;
    continent?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    postal_code?: string;
    latitude?: number;
    longitude?: number;
    time_zone?: string;
    asn?: string;
    asn_org?: string;
    is_proxy?: boolean;
}
