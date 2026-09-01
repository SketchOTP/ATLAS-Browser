import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebsiteMediaPermissions, websiteMediaPermissionAllowed } from './website-media-permissions.mjs';

test('website camera and microphone access default to enabled', () => {
  assert.deepEqual(normalizeWebsiteMediaPermissions(), { microphone: true, camera: true });
  assert.equal(websiteMediaPermissionAllowed({}, 'media', { mediaTypes: ['audio'] }), true);
  assert.equal(websiteMediaPermissionAllowed({}, 'media', { mediaTypes: ['video'] }), true);
});

test('profile settings independently control requested media types', () => {
  const microphoneOnly = { microphone: true, camera: false };
  assert.equal(websiteMediaPermissionAllowed(microphoneOnly, 'media', { mediaTypes: ['audio'] }), true);
  assert.equal(websiteMediaPermissionAllowed(microphoneOnly, 'media', { mediaTypes: ['video'] }), false);
  assert.equal(websiteMediaPermissionAllowed(microphoneOnly, 'media', { mediaTypes: ['audio', 'video'] }), false);
  assert.equal(websiteMediaPermissionAllowed(microphoneOnly, 'media', { mediaType: 'audio' }), true);
  assert.equal(websiteMediaPermissionAllowed(microphoneOnly, 'media', { mediaType: 'video' }), false);
  assert.equal(websiteMediaPermissionAllowed(microphoneOnly, 'speaker-selection'), true);
});

test('unrelated website permissions remain denied', () => {
  assert.equal(websiteMediaPermissionAllowed({}, 'geolocation'), false);
  assert.equal(websiteMediaPermissionAllowed({}, 'notifications'), false);
});
