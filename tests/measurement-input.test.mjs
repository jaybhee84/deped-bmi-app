import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeasurementHeight, parseMeasurementWeight } from '../src/utils/measurementInput.js';

test('baseline measurement validation rejects malformed, negative and non-finite inputs', () => {
  for (const value of ['-17', '17kg', 'Infinity', 'NaN', '0', '']) {
    assert.equal(parseMeasurementWeight(value), null);
  }
  for (const value of ['0.1025', '-110', '110cm', 'Infinity', '']) {
    assert.equal(parseMeasurementHeight(value), null);
  }
  assert.equal(parseMeasurementWeight('17.5'), 17.5);
  assert.equal(parseMeasurementHeight('110.3', 'cm'), 1.103);
  assert.equal(parseMeasurementHeight('1.103', 'm'), 1.103);
  assert.equal(parseMeasurementHeight('110.3'), 1.103);
});
