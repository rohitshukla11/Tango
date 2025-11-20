// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PredictionGameScroll
 * @notice Scroll-compatible prediction game using commit-reveal pattern (no BlockLock dependency).
 *
 * Flow:
 * 1. Anyone calls {submitPrediction} with hashed score (keccak256(score + salt)) and stake.
 *    Prediction stays locked until `unlockBlock`.
 * 2. After unlock block, predictor calls {revealPrediction} with score and salt to reveal.
 * 3. Owner sets AI score via {setAIScore} once judging is complete.
 * 4. Anyone calls {settlePrediction} once both scores are available to release payout based on accuracy.
 *
 * Payouts:
 * - Exact match (diff == 0): 200% of stake returned.
 * - Within ±0.25 (diff <= 25 scaled): 50% of stake returned.
 * - Within ±0.5  (diff <= 50 scaled): 25% of stake returned.
 * - Otherwise: stake remains in contract (owner can withdraw surplus later).
 */
contract PredictionGameScroll is ReentrancyGuard, Ownable {
	struct Prediction {
		address predictor;
		uint256 amountStaked;
		uint256 unlockBlock;
		bytes32 commitment; // keccak256(abi.encodePacked(scoreScaled, salt))
		bool revealed;
		bool settled;
		uint16 revealedScore;
	}

	uint256 public minStake = 1 wei;

	// entryId => prediction data
	mapping(uint256 => Prediction) public predictions;
	// entryId => AI score (scaled by 100, e.g., 725 = 7.25)
	mapping(uint256 => uint16) public aiScores;
	// entryId => IPFS CID (for verification and tracking)
	mapping(uint256 => string) public entryCids;

	event PredictionSubmitted(
		uint256 indexed entryId,
		address indexed predictor,
		uint256 unlockBlock,
		uint256 amountStaked,
		string videoCid,
		bytes32 commitment
	);

	event PredictionRevealed(
		uint256 indexed entryId,
		uint16 revealedScore
	);

	event PredictionSettled(
		uint256 indexed entryId,
		address indexed predictor,
		uint16 aiScoreScaled,
		uint16 predictedScoreScaled,
		uint256 payout
	);

	event AIScoreSet(uint256 indexed entryId, uint16 aiScoreScaled);

	constructor() Ownable(msg.sender) {}

	function setMinStake(uint256 newMinStake) external onlyOwner {
		minStake = newMinStake;
	}

	/**
	 * @notice Set the AI score for an entry. Only owner can call this.
	 * @param entryId The entry ID
	 * @param aiScoreScaled The AI score scaled by 100 (e.g., 725 = 7.25, max 1000 = 10.00)
	 */
	function setAIScore(uint256 entryId, uint16 aiScoreScaled) external onlyOwner {
		require(aiScoreScaled <= 1000, "score > 10.00");
		aiScores[entryId] = aiScoreScaled;
		emit AIScoreSet(entryId, aiScoreScaled);
	}

	/**
	 * @notice Submit a prediction with a commitment (hash of score + salt).
	 * @param entryId The entry ID
	 * @param videoCid The IPFS CID of the video
	 * @param commitment keccak256(abi.encodePacked(scoreScaled, salt))
	 * @param unlockBlock Block number when prediction can be revealed
	 */
	function submitPrediction(
		uint256 entryId,
		string calldata videoCid,
		bytes32 commitment,
		uint256 unlockBlock
	) external payable {
		require(msg.value >= minStake, "stake too low");
		require(unlockBlock > block.number, "unlock block must be future");
		require(bytes(videoCid).length > 0, "video CID required");
		require(commitment != bytes32(0), "commitment required");

		Prediction storage prediction = predictions[entryId];
		require(prediction.predictor == address(0), "prediction exists");

		// Store IPFS CID for this entryId (first time only)
		if (bytes(entryCids[entryId]).length == 0) {
			entryCids[entryId] = videoCid;
		}

		prediction.predictor = msg.sender;
		prediction.amountStaked = msg.value;
		prediction.unlockBlock = unlockBlock;
		prediction.commitment = commitment;
		prediction.revealed = false;
		prediction.settled = false;
		prediction.revealedScore = 0;

		emit PredictionSubmitted(entryId, msg.sender, unlockBlock, msg.value, videoCid, commitment);
	}

	/**
	 * @notice Reveal the prediction after unlock block.
	 * @param entryId The entry ID
	 * @param scoreScaled The predicted score scaled by 100 (e.g., 750 = 7.50)
	 * @param salt The salt used in the commitment
	 */
	function revealPrediction(
		uint256 entryId,
		uint16 scoreScaled,
		bytes32 salt
	) external {
		Prediction storage prediction = predictions[entryId];
		require(prediction.predictor != address(0), "no prediction");
		require(prediction.predictor == msg.sender, "not your prediction");
		require(block.number >= prediction.unlockBlock, "prediction locked");
		require(!prediction.revealed, "already revealed");
		require(scoreScaled <= 1000, "score > 10.00");

		// Verify commitment
		bytes32 computedCommitment = keccak256(abi.encodePacked(scoreScaled, salt));
		require(computedCommitment == prediction.commitment, "commitment mismatch");

		prediction.revealed = true;
		prediction.revealedScore = scoreScaled;

		emit PredictionRevealed(entryId, scoreScaled);
	}

	/**
	 * @notice Settle the prediction and calculate payout.
	 * @param entryId The entry ID
	 */
	function settlePrediction(uint256 entryId) external nonReentrant {
		Prediction storage prediction = predictions[entryId];
		require(prediction.predictor != address(0), "no prediction");
		require(prediction.revealed, "not revealed yet");
		require(!prediction.settled, "already settled");
		require(block.number >= prediction.unlockBlock, "prediction locked");

		uint256 stakedAmount = prediction.amountStaked;
		require(stakedAmount > 0, "stake missing");

		uint16 aiScoreScaled = aiScores[entryId];
		require(aiScoreScaled > 0, "AI score not set");

		uint16 predicted = prediction.revealedScore;
		uint16 diff = predicted > aiScoreScaled ? predicted - aiScoreScaled : aiScoreScaled - predicted;

		uint256 payout;
		if (diff == 0) {
			payout = stakedAmount * 200 / 100;
		} else if (diff <= 25) {
			payout = stakedAmount * 50 / 100;
		} else if (diff <= 50) {
			payout = stakedAmount * 25 / 100;
		} else {
			payout = 0;
		}

		prediction.settled = true;
		prediction.amountStaked = 0;

		if (payout > 0) {
			require(address(this).balance >= payout, "insufficient balance");
			(bool success, ) = prediction.predictor.call{value: payout}("");
			require(success, "payout failed");
		}

		emit PredictionSettled(entryId, prediction.predictor, aiScoreScaled, predicted, payout);
	}

	/**
	 * @notice Owner can withdraw surplus funds (from lost predictions).
	 */
	function withdraw(address payable to, uint256 amount) external onlyOwner {
		require(to != address(0), "zero address");
		require(address(this).balance >= amount, "insufficient balance");
		(bool success, ) = to.call{value: amount}("");
		require(success, "withdraw failed");
	}

	/**
	 * @notice Helper function to compute commitment off-chain.
	 * @param scoreScaled The score scaled by 100
	 * @param salt Random salt
	 * @return commitment keccak256(abi.encodePacked(scoreScaled, salt))
	 */
	function computeCommitment(uint16 scoreScaled, bytes32 salt) external pure returns (bytes32) {
		return keccak256(abi.encodePacked(scoreScaled, salt));
	}
}

