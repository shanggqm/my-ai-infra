import test from 'node:test';
import assert from 'node:assert/strict';
import { appRefundAllowed } from './app.mjs';
import { supportRefundAllowed } from './support.mjs';
import { enterpriseRefundAllowed } from './enterprise.mjs';

const day = 24 * 60 * 60 * 1000;
const order = { tenantId: 'tenant-demo', status: 'PAID', paidAt: 0 };
const actor = { tenantId: 'tenant-demo' };

test('App retail policy boundary and rejection', () => {
  assert.equal(appRefundAllowed(order, actor, 14 * day), true);
  assert.equal(appRefundAllowed(order, actor, 14 * day + 1), false);
  assert.equal(appRefundAllowed(order, actor, -1), false);
  assert.equal(appRefundAllowed({ ...order, status: 'REFUNDED' }, actor, day), false);
  assert.equal(appRefundAllowed(order, { tenantId: 'another-tenant' }, day), false);
});

test('App repeat evaluation is stable', () => {
  const expected = appRefundAllowed(order, actor, 10 * day);
  assert.equal(appRefundAllowed(order, actor, 10 * day), expected);
});

test('Support repeat evaluation is stable', () => {
  const expected = supportRefundAllowed(order, actor, 10 * day);
  assert.equal(supportRefundAllowed(order, actor, 10 * day), expected);
});

test('Enterprise contract boundary and rejection', () => {
  assert.equal(enterpriseRefundAllowed(order, actor, 30 * day), true);
  assert.equal(enterpriseRefundAllowed(order, actor, 30 * day + 1), false);
  assert.equal(enterpriseRefundAllowed(order, { tenantId: 'another-tenant' }, day), false);
});
