import type { Migration } from './types';
import { base } from './000-base';
import { organizations } from './001-organizations';
import { uptime } from './002-uptime';
import { notifications } from './003-notifications';
import { mfa } from './004-mfa';
import { nodeShares } from './005-node-shares';

/**
 * Every migration, in the order they are applied.
 *
 * Append only. An id is recorded in `schema_migrations` once it has run, so
 * renaming or reordering makes an applied migration look new.
 *
 * Order matters in exactly one way: `000-base` creates `users`, and everything
 * after it references that table. Beyond that these are independent.
 *
 * All six run on **every** boot — see `../migrate.ts` for why that is the
 * design rather than an oversight. Nothing in this repo is applied by hand any
 * more; starting the app against a database is what migrates it.
 */
export const MIGRATIONS: readonly Migration[] = [
    base,
    organizations,
    uptime,
    notifications,
    mfa,
    nodeShares,
];

export type { Migration };
