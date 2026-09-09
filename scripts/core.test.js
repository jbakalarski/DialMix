const test = require('node:test'); const assert = require('node:assert/strict');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
test('volume changes clamp to 0..100', () => { assert.equal(clamp(-10, 0, 100), 0); assert.equal(clamp(140, 0, 100), 100); });
test('step changes are exact percentage points', () => { assert.equal(clamp(50 + 5, 0, 100), 55); assert.equal(clamp(50 - 5, 0, 100), 45); });
