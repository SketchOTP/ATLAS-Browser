import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedWebsiteUrl, websiteWindowRoute } from './website-window-routing.mjs';

test('ordinary website-created pages route into ATLAS tabs', () => {
  assert.equal(websiteWindowRoute('https://example.com/article'), 'tab');
  assert.equal(websiteWindowRoute('https://github.com/SketchOTP/ATLAS-Browser'), 'tab');
});

test('recognized sign-in flows retain a compatible popup window', () => {
  assert.equal(websiteWindowRoute('https://accounts.google.com/o/oauth2/v2/auth?client_id=test'), 'popup');
  assert.equal(websiteWindowRoute('https://example.okta.com/oauth2/v1/authorize?client_id=test'), 'popup');
  assert.equal(websiteWindowRoute('about:blank'), 'popup');
});

test('unsupported and malformed destinations are denied', () => {
  assert.equal(isAllowedWebsiteUrl('javascript:alert(1)'), false);
  assert.equal(websiteWindowRoute('javascript:alert(1)'), 'deny');
  assert.equal(websiteWindowRoute('not a url'), 'deny');
});
