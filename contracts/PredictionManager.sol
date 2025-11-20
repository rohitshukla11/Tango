// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILatentContest {
	function isFinalized(uint256 entryId) external view returns (bool);
	function creatorOf(uint256 entryId) external view returns (address);
}

contract PredictionManager {
	event PredictionCommitted(uint256 indexed entryId, bytes32 commitHash);
	event PredictionRevealed(uint256 indexed entryId, uint16 predictedScoreScaled, bytes32 salt);

	address public immutable contest;

	// Score uses 2 decimals; 0..1000 represents 0.00 .. 10.00
	uint16 public constant SCORE_SCALE = 100;

	mapping(uint256 => bytes32) public commitOf; // entryId => commitHash
	mapping(uint256 => bool) public isRevealed;
	mapping(uint256 => uint16) public predictedScoreOf; // scaled by SCORE_SCALE

	modifier onlyContest() {
		require(msg.sender == contest, "Not contest");
		_;
	}

	constructor(address contestAddress) {
		require(contestAddress != address(0), "contest addr required");
		contest = contestAddress;
	}

	function commit(uint256 entryId, bytes32 commitHash) external onlyContest {
		require(commitOf[entryId] == bytes32(0), "commit exists");
		commitOf[entryId] = commitHash;
		emit PredictionCommitted(entryId, commitHash);
	}

	function reveal(uint256 entryId, uint16 predictedScoreScaled, bytes32 salt) external {
		require(!isRevealed[entryId], "already revealed");
		require(predictedScoreScaled <= 10 * SCORE_SCALE, "score > 10.00");
		address creator = ILatentContest(contest).creatorOf(entryId);
		require(msg.sender == creator, "only creator");
		// Reveal allowed only AFTER contest finalized
		require(ILatentContest(contest).isFinalized(entryId), "not finalized");
		bytes32 commitHash = commitOf[entryId];
		require(commitHash != bytes32(0), "no commit");
		require(keccak256(abi.encode(predictedScoreScaled, salt)) == commitHash, "invalid reveal");
		isRevealed[entryId] = true;
		predictedScoreOf[entryId] = predictedScoreScaled;
		emit PredictionRevealed(entryId, predictedScoreScaled, salt);
	}
}


