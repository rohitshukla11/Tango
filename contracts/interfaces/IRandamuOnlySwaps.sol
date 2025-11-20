// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRandamuOnlySwaps {
	struct Payout {
		address wallet;
		uint256 amount; // wei of native token or token units if ERC20
		uint256 chainId; // destination chain id
	}

	// Execute payouts across chains using solver network.
	// msg.value should equal sum of payouts amounts if using native token.
	function executeOnlySwaps(Payout[] calldata payouts) external payable;
}


