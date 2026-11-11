import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMetadata } from '../src/migrations/openspec-metadata.mjs';

test('OpenSpec metadata detects unsupported and semantically significant inputs', () => {
  const inspect = text => inspectMetadata(Buffer.from(text));
  assert.deepEqual(inspect('schema: spec-driven\ncreated: 2026-01-02\nskip_specs: false\nx-team: platform\n'), {
    supported: true, schema: 'spec-driven', skipSpecs: false, retireCapabilities: false, unknown: ['x-team']
  });
  assert.equal(inspect('schema: custom-flow\n').supported, false);
  assert.equal(inspect('schema: spec-driven\nschema: spec-driven\n').supported, false);
  assert.equal(inspect('schema: spec-driven\nskip_specs: "true"\n').supported, false);
  assert.equal(inspect('schema: spec-driven\nretire_capabilities: true\n').retireCapabilities, true);
  assert.equal(inspectMetadata(Buffer.from([255])).supported, false);
  assert.equal(inspectMetadata(null).supported, false);
});

test('supported metadata preserves quoting, comments, lists and initiative mapping', () => {
  const text = `schema: spec-driven # comment
goal: "hash # preserved"
affected_areas: ["auth,session", 'search']
initiative:
  store: team-store
  id: login-work
skip_specs: false # comment
`;
  assert.deepEqual(inspectMetadata(Buffer.from(text)), {
    supported: true, schema: 'spec-driven', skipSpecs: false, retireCapabilities: false, unknown: []
  });
  assert.equal(inspectMetadata(Buffer.from('schema: spec-driven\ninitiative:\n  store: a\n  store: b\n  id: c\n')).supported, false);
});
