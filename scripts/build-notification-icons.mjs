#!/usr/bin/env node
/*
 * Builds the coloured push-notification icons from the one canonical mark.
 *
 * A push notification cannot tint its icon — there is no colour option in
 * `showNotification` that any browser honours — so "this one is bad news" has to
 * arrive as a different image. These are that image: the same geometry, the same
 * gradient stop offsets, the same weights, with only the hue rotated. The result
 * reads as the product's own logo lit wrong, rather than as three unrelated
 * marks, which is the difference between a signal and a puzzle at 3am.
 *
 * The three colours are the ones the dashboard already uses for monitor state:
 * green is healthy, amber is worth a look, red is broken. Nothing here invents a
 * fourth vocabulary.
 *
 *     node scripts/build-notification-icons.mjs           # write
 *     node scripts/build-notification-icons.mjs --check   # verify, exit 1 on drift
 *
 * Run it after any edit to src/app/icon.svg. The `--check` mode is what makes
 * that a rule rather than a hope: the outputs are committed, so a logo change
 * that skips this leaves them stale and silently wrong.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'src/app/icon.svg');
const OUT_DIR = path.join(root, 'public');
const SIZE = 192;

/**
 * The source palette, written out because it is what the substitution matches
 * on. If `icon.svg` changes a stop *colour*, this list is what stops the build
 * silently producing an icon with one un-rotated hue in it — a mismatch is a
 * hard failure below, not a partial recolour.
 */
const ORIGINAL = {
    mark: ['hsl(122 88% 52%)', 'hsl(150 92% 56%)', 'hsl(172 92% 58%)', 'hsl(196 96% 66%)'],
    body: ['hsl(152 32% 13%)', 'hsl(172 34% 9%)', 'hsl(196 38% 8%)'],
    bloom: 'hsl(172 92% 58%)',
    edge: ['hsl(122 88% 52%)', 'hsl(196 96% 66%)'],
};

const VARIANTS = {
    alert: {
        note: 'Outage red. Rotated off the crimson end rather than flattened to one red,\n'
            + '       so the sweep still runs and the mark stays recognisably the same logo.',
        mark: ['hsl(342 88% 56%)', 'hsl(354 92% 58%)', 'hsl(6 94% 58%)', 'hsl(20 96% 62%)'],
        body: ['hsl(348 30% 13%)', 'hsl(0 32% 9%)', 'hsl(12 36% 8%)'],
        bloom: 'hsl(0 92% 58%)',
        edge: ['hsl(342 88% 56%)', 'hsl(20 96% 62%)'],
    },
    warn: {
        note: 'Degraded amber — the middle of the same three-colour scale the monitor\n'
            + '       cards and the status dot already use.',
        mark: ['hsl(28 92% 54%)', 'hsl(38 96% 56%)', 'hsl(46 96% 58%)', 'hsl(54 96% 62%)'],
        body: ['hsl(32 30% 13%)', 'hsl(40 32% 9%)', 'hsl(48 36% 8%)'],
        bloom: 'hsl(40 94% 58%)',
        edge: ['hsl(28 92% 54%)', 'hsl(54 96% 62%)'],
    },
};

/**
 * Replaces every occurrence, and fails loudly if the count is not what this
 * script was written against.
 *
 * The count matters as much as the match. The bloom is two stops of the *same*
 * colour at different opacities, so recolouring one of them would leave the
 * gradient fading from red to teal; a `mark` stop is one. Asserting the number
 * turns "icon.svg was edited" into a build failure with a message, instead of an
 * icon that is subtly the wrong colour in one corner.
 */
function substitute(svg, from, to, what, expected) {
    const parts = svg.split(from);
    if (parts.length - 1 !== expected) {
        throw new Error(
            `expected ${expected} × "${from}" for ${what}, found ${parts.length - 1}. `
            + 'src/app/icon.svg has changed — update ORIGINAL in this script.',
        );
    }
    return parts.join(to);
}

function recolour(svg, name, variant) {
    let out = svg;

    // The bloom first, and both of its stops: it is one colour held at two
    // opacities, and it reuses a `mark` colour, so rotating `mark` first would
    // leave this nothing to match. The `stop-opacity` suffix is what separates a
    // bloom stop from the identically-coloured mark stop.
    out = substitute(
        out,
        `stop-color="${ORIGINAL.bloom}" stop-opacity`,
        `stop-color="${variant.bloom}" stop-opacity`,
        'bloom',
        2,
    );

    for (const group of ['mark', 'body']) {
        for (const [i, from] of ORIGINAL[group].entries()) {
            out = substitute(
                out,
                `stop-color="${from}" />`,
                `stop-color="${variant[group][i]}" />`,
                `${group} stop ${i}`,
                1,
            );
        }
    }

    // Both edge stops reuse `mark` colours, and both carry `stop-opacity` — so
    // by now the bloom has already been rotated out of the way and exactly one
    // of each remains.
    for (const [i, from] of ORIGINAL.edge.entries()) {
        out = substitute(
            out,
            `stop-color="${from}" stop-opacity`,
            `stop-color="${variant.edge[i]}" stop-opacity`,
            `edge stop ${i}`,
            1,
        );
    }

    const header = `<!--\n  Push notification icon — ${name}.\n\n`
        + '  Generated from src/app/icon.svg by scripts/build-notification-icons.mjs:\n'
        + `  same geometry, same stop offsets, hue rotated. ${variant.note}\n`
        + '  Do not hand-edit — regenerate.\n-->\n';

    return header + out;
}

const check = process.argv.includes('--check');
const source = await readFile(SOURCE, 'utf8');
let drifted = false;

for (const [name, variant] of Object.entries(VARIANTS)) {
    const svg = recolour(source, name, variant);
    const png = await sharp(Buffer.from(svg)).resize(SIZE, SIZE).png().toBuffer();

    const svgPath = path.join(OUT_DIR, `icon-${name}.svg`);
    const pngPath = path.join(OUT_DIR, `icon-${name}-192.png`);

    if (check) {
        for (const [file, built] of [[svgPath, Buffer.from(svg)], [pngPath, png]]) {
            const current = await readFile(file).catch(() => null);
            if (current === null || !current.equals(built)) {
                console.error(`stale: ${path.relative(root, file)}`);
                drifted = true;
            }
        }
        continue;
    }

    await writeFile(svgPath, svg);
    await writeFile(pngPath, png);
    console.log(`wrote ${path.relative(root, svgPath)} and ${path.relative(root, pngPath)}`);
}

if (drifted) {
    console.error('\nRun `node scripts/build-notification-icons.mjs` and commit the result.');
    process.exit(1);
}

if (check) console.log('notification icons are up to date');
