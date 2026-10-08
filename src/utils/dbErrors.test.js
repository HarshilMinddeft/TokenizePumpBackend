const test = require('node:test');
const assert = require('node:assert/strict');
const { isDbUnreachable, isDuplicateKey, dbErrorToAppError } = require('./dbErrors');

test('a DNS failure reaching Atlas is "unreachable" (the real error shape from a dev machine)', () => {
  const err = Object.assign(new Error('getaddrinfo EAI_AGAIN ac-zmgwh1k-shard-00-01.nguunro.mongodb.net'), {
    name: 'MongoNetworkError',
    errorLabelSet: new Set(['ResetPool']),
    cause: Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' }),
  });
  assert.equal(isDbUnreachable(err), true);
  const mapped = dbErrorToAppError(err);
  assert.equal(mapped.statusCode, 503);
  assert.match(mapped.message, /temporarily unreachable/);
});

test('other ways of not reaching the database are recognised too', () => {
  for (const name of ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkTimeoutError', 'MongoNotConnectedError']) {
    assert.equal(isDbUnreachable(Object.assign(new Error('x'), { name })), true, name);
  }
  assert.equal(isDbUnreachable(Object.assign(new Error('Operation `3643assets.find()` buffering timed out after 10000ms'), { name: 'MongooseError' })), true);
});

test('unrelated errors are not swallowed', () => {
  assert.equal(isDbUnreachable(new Error('boom')), false);
  assert.equal(isDbUnreachable(Object.assign(new Error('x'), { name: 'ValidationError' })), false);
  assert.equal(isDbUnreachable(Object.assign(new Error('other mongoose'), { name: 'MongooseError' })), false);
  assert.equal(isDbUnreachable(Object.assign(new Error('getaddrinfo EAI_AGAIN rpc.example'), { code: 'EAI_AGAIN' })), false, 'chain RPC DNS errors are not DB errors');
  assert.equal(isDbUnreachable(null), false);
  assert.equal(dbErrorToAppError(new Error('boom')), null);
});

test('duplicate-key writes are detected', () => {
  assert.equal(isDuplicateKey(Object.assign(new Error('E11000 duplicate key'), { code: 11000 })), true);
  assert.equal(isDuplicateKey(new Error('x')), false);
  assert.equal(isDuplicateKey(undefined), false);
});
