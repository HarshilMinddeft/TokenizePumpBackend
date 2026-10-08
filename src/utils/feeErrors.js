const { ethers } = require('ethers');

// FeeManager.getFeeConfig(version) reverts with FeeConfigNotFound(version) until
// an owner has called createFeeConfig at least once after deployment.
const FEE_CONFIG_NOT_FOUND = ethers.id('FeeConfigNotFound(uint256)').slice(0, 10);

/** Whether a failed contract call is the FeeManager's "no fee config yet" revert. */
const isFeeConfigNotFound = (err) => typeof err?.data === 'string' && err.data.startsWith(FEE_CONFIG_NOT_FOUND);

module.exports = { FEE_CONFIG_NOT_FOUND, isFeeConfigNotFound };
