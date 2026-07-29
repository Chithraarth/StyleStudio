/**
 * Unit tests for the reference-matching logic that keeps the orphaned
 * snapshot sweep from deleting photos that are still in use.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 * (node --test with native TypeScript type stripping)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collectReferencedObjectNames,
  findOrphanObjectNames,
  normalizePrivateDir,
  parseObjectPath,
} from './snapshotRefs.ts';

const PRIVATE_DIR = '/my-bucket/.private';

test('parseObjectPath splits bucket and object name', () => {
  assert.deepEqual(parseObjectPath('/my-bucket/.private/uploads/abc'), {
    bucketName: 'my-bucket',
    objectName: '.private/uploads/abc',
  });
});

test('parseObjectPath tolerates missing leading slash', () => {
  assert.deepEqual(parseObjectPath('my-bucket/.private/uploads/abc'), {
    bucketName: 'my-bucket',
    objectName: '.private/uploads/abc',
  });
});

test('parseObjectPath rejects paths without an object name', () => {
  assert.throws(() => parseObjectPath('/my-bucket'));
});

test('normalizePrivateDir strips a trailing slash', () => {
  assert.equal(normalizePrivateDir('/my-bucket/.private/'), '/my-bucket/.private');
  assert.equal(normalizePrivateDir('/my-bucket/.private'), '/my-bucket/.private');
});

test('referenced objects are never marked orphaned', () => {
  const referenced = collectReferencedObjectNames(PRIVATE_DIR, [
    '/objects/uploads/photo-1',
    '/objects/uploads/photo-2',
  ]);
  const stored = [
    '.private/uploads/photo-1',
    '.private/uploads/photo-2',
    '.private/uploads/photo-3',
  ];
  const orphans = findOrphanObjectNames(stored, referenced);
  assert.deepEqual(orphans, ['.private/uploads/photo-3']);
  // The referenced photos must not appear among deletion candidates.
  assert.ok(!orphans.includes('.private/uploads/photo-1'));
  assert.ok(!orphans.includes('.private/uploads/photo-2'));
});

test('legacy base64 data URLs and nulls are ignored', () => {
  const referenced = collectReferencedObjectNames(PRIVATE_DIR, [
    'data:image/png;base64,iVBORw0KGgo=',
    null,
    '',
    'https://example.com/objects/uploads/nope',
    '/objects/uploads/real-photo',
  ]);
  assert.deepEqual([...referenced], ['.private/uploads/real-photo']);
});

test('trailing-slash private dirs parse to the same object names', () => {
  const withSlash = collectReferencedObjectNames('/my-bucket/.private/', [
    '/objects/uploads/photo-1',
  ]);
  const withoutSlash = collectReferencedObjectNames('/my-bucket/.private', [
    '/objects/uploads/photo-1',
  ]);
  assert.deepEqual([...withSlash], ['.private/uploads/photo-1']);
  assert.deepEqual([...withSlash], [...withoutSlash]);
});

test('no orphans when every stored object is referenced', () => {
  const referenced = collectReferencedObjectNames(PRIVATE_DIR, ['/objects/uploads/a']);
  assert.deepEqual(findOrphanObjectNames(['.private/uploads/a'], referenced), []);
});
