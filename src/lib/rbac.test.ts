import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ROLES,
    can,
    canActOnMember,
    canGrantRole,
    isRole,
    type Permission,
    type Role,
} from './rbac.ts';

/**
 * The permission table is the whole access model, and it is enforced verbatim on
 * the API (`src/app/lib/authz.ts` calls `can` from here). These are the
 * statements about it that a change must not break silently.
 */

test('a member reaches nothing beyond their own', () => {
    const denied: Permission[] = [
        'nodes:read:all', 'nodes:manage:all',
        'monitors:read:all', 'tokens:read:all',
        'org:manage', 'org:transfer',
        'servers:read', 'servers:manage',
        'users:read', 'users:manage', 'users:invite',
        'pipelines:manage',
    ];

    for (const permission of denied) {
        assert.equal(can('member', permission), false, `member should not hold ${permission}`);
    }

    // The two they do hold: they are in an organisation, and pipelines touch
    // their machines.
    assert.equal(can('member', 'org:read'), true);
    assert.equal(can('member', 'pipelines:read'), true);
});

test('an owner holds everything an admin holds', () => {
    for (const permission of PERMISSIONS) {
        if (can('admin', permission)) {
            assert.equal(can('owner', permission), true, `owner should hold ${permission}`);
        }
    }
});

test('an admin holds everything a member holds', () => {
    for (const permission of PERMISSIONS) {
        if (can('member', permission)) {
            assert.equal(can('admin', permission), true, `admin should hold ${permission}`);
        }
    }
});

test('only an owner decides who the owner is', () => {
    assert.equal(can('admin', 'org:transfer'), false);
    assert.equal(can('admin', 'org:manage'), false);
    assert.equal(can('owner', 'org:transfer'), true);
    assert.equal(can('owner', 'org:manage'), true);
});

test('nobody administers themselves', () => {
    for (const role of ROLES) {
        assert.equal(canActOnMember(role, role, true), false, `${role} acting on self`);
    }
});

test('an admin may not touch an owner, but an owner may', () => {
    assert.equal(canActOnMember('admin', 'owner', false), false);
    assert.equal(canActOnMember('admin', 'admin', false), true);
    assert.equal(canActOnMember('admin', 'member', false), true);

    assert.equal(canActOnMember('owner', 'owner', false), true);
    assert.equal(canActOnMember('owner', 'admin', false), true);
});

test('a member may not act on anybody, including another member', () => {
    for (const target of ROLES) {
        assert.equal(canActOnMember('member', target, false), false, `member acting on ${target}`);
    }
});

test('granting owner needs org:transfer; granting the rest needs users:manage', () => {
    assert.equal(canGrantRole('owner', 'owner'), true);
    assert.equal(canGrantRole('admin', 'owner'), false);
    assert.equal(canGrantRole('member', 'owner'), false);

    assert.equal(canGrantRole('admin', 'admin'), true);
    assert.equal(canGrantRole('admin', 'member'), true);
    assert.equal(canGrantRole('member', 'member'), false);
});

test('isRole refuses anything outside the table', () => {
    for (const role of ROLES) {
        assert.equal(isRole(role), true);
    }

    for (const value of ['Owner', 'root', 'superuser', '', null, undefined, 0, {}]) {
        assert.equal(isRole(value), false, `isRole(${String(value)})`);
    }
});

/**
 * Every permission the union names. Kept as a literal rather than derived,
 * deliberately: adding a permission should make somebody come here and decide
 * which roles hold it, not silently pass because the list generated itself.
 */
const PERMISSIONS: Permission[] = [
    'nodes:read:all', 'nodes:manage:all',
    'monitors:read:all', 'tokens:read:all',
    'org:read', 'org:manage', 'org:transfer',
    'servers:read', 'servers:manage',
    'users:read', 'users:manage', 'users:invite',
    'pipelines:read', 'pipelines:manage',
];

test('every declared permission is held by at least one role', () => {
    for (const permission of PERMISSIONS) {
        const holders = ROLES.filter((role: Role) => can(role, permission));
        assert.ok(holders.length > 0, `nothing grants ${permission}`);
    }
});
