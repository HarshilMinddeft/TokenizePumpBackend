const test = require('node:test');
const assert = require('node:assert/strict');
const { FEE_CONFIG_NOT_FOUND, isFeeConfigNotFound } = require('./feeErrors');

test('the selector is FeeConfigNotFound(uint256)', () => {
  assert.equal(FEE_CONFIG_NOT_FOUND, '0x21b7436d');
});

test('recognises the revert a fresh, unconfigured FeeManager produces (real error shape)', () => {
  // From ethers v6 CALL_EXCEPTION on FeeManager.getFeeConfig(0).
  const err = Object.assign(new Error('execution reverted (unknown custom error)'), {
    code: 'CALL_EXCEPTION',
    data: '0x21b7436d0000000000000000000000000000000000000000000000000000000000000000',
  });
  assert.equal(isFeeConfigNotFound(err), true);
});

test('does not mistake other failures for it', () => {
  assert.equal(isFeeConfigNotFound(Object.assign(new Error('x'), { code: 'CALL_EXCEPTION', data: '0x08c379a0' })), false);
  assert.equal(isFeeConfigNotFound(Object.assign(new Error('x'), { code: 'NETWORK_ERROR' })), false);
  assert.equal(isFeeConfigNotFound(Object.assign(new Error('x'), { data: null })), false);
  assert.equal(isFeeConfigNotFound(null), false);
  assert.equal(isFeeConfigNotFound(undefined), false);
});
