export type PublicRuntimeConfig = Record<`NEXT_PUBLIC_${string}`, string>;

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
    const entries = Object.entries(process.env).filter(([key, value]) => key.startsWith('NEXT_PUBLIC_') && typeof value === 'string');

    return Object.fromEntries(entries) as PublicRuntimeConfig;
}
