// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRandamuVRF {
	// Request randomness; returns requestId
	function requestRandomness(bytes32 salt) external returns (uint256);

	// Coordinator calls back with randomness
	function fulfillRandomness(uint256 requestId, uint256 randomness) external;
}


