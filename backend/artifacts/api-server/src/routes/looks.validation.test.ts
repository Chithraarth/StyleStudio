/**
 * Contract test for the shirtTextureUrl bound on look selections.
 *
 * The create/update look routes validate the request body with the shared
 * zod schema (CreateLookBody.safeParse), so asserting the schema rejects an
 * oversized or non-image data URL guards the exact enforcement path the route
 * uses — preventing unbounded inline-image payload growth on saved looks.
 *
 * Runs with Node's built-in test runner (node --test, native TS stripping):
 *   pnpm --filter @workspace/api-server run test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CreateLookBody, createLookBodySelectionsShirtTextureUrlMax } from '@workspace/api-zod';

const MAX = createLookBodySelectionsShirtTextureUrlMax;

const bodyWith = (shirtTextureUrl: string) => ({
  name: 'Test Look',
  selections: { shirtTextureUrl },
});

test('accepts a small image data URL for shirtTextureUrl', () => {
  const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
  const parsed = CreateLookBody.safeParse(bodyWith(dataUrl));
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
});

test('accepts an absent shirtTextureUrl (backward compatible)', () => {
  const parsed = CreateLookBody.safeParse({ name: 'No Photo', selections: {} });
  assert.equal(parsed.success, true);
});

test('rejects an oversized shirtTextureUrl (payload-growth guard)', () => {
  const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(MAX + 1);
  const parsed = CreateLookBody.safeParse(bodyWith(dataUrl));
  assert.equal(parsed.success, false);
});

test('rejects a non-image data URL for shirtTextureUrl', () => {
  const parsed = CreateLookBody.safeParse(bodyWith('data:text/html;base64,PHNjcmlwdD4='));
  assert.equal(parsed.success, false);
});

test('rejects a value that is not a data URL at all', () => {
  const parsed = CreateLookBody.safeParse(bodyWith('https://example.com/shirt.jpg'));
  assert.equal(parsed.success, false);
});
