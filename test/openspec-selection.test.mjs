import test from 'node:test';
import assert from 'node:assert/strict';
import { selectChanges } from '../src/migrations/openspec-selection.mjs';

test('OpenSpec batch selection is explicit, deterministic and rejects inactive IDs', () => {
  assert.deepEqual(selectChanges({ changes: 'beta,alpha' }, ['alpha', 'beta', 'gamma']), {
    mode: 'changes', ids: ['alpha', 'beta']
  });
  assert.deepEqual(selectChanges({ active: true }, ['beta', 'alpha']), {
    mode: 'active', ids: ['alpha', 'beta']
  });
  assert.throws(() => selectChanges({ changes: 'alpha,alpha' }, ['alpha']), /重复/);
  assert.throws(() => selectChanges({ changes: 'alpha,missing' }, ['alpha']), /找不到活动/);
  assert.throws(() => selectChanges({ change: '../outside' }, ['../outside']), /直接子目录/);
  assert.throws(() => selectChanges({ active: true, all: true }, []), /请选择/);
});
