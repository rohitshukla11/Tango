// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPredictionManager {
	function commit(uint256 entryId, bytes32 commitHash) external;
	function isRevealed(uint256 entryId) external view returns (bool);
	function predictedScoreOf(uint256 entryId) external view returns (uint16);
}

contract LatentContest {
	event EntryCreated(uint256 indexed entryId, address indexed creator, string videoCid, bytes32 commitHash, uint256 stake);
	event AudienceScored(uint256 indexed entryId, address indexed scorer, uint16 scoreScaled, uint256 stake, bool creditsMode);
	event AIScoreSet(uint256 indexed entryId, uint16 aiScoreScaled);
	event EntryFinalized(uint256 indexed entryId, uint16 audienceAvgScoreScaled, uint16 finalScoreScaled);
	event StoragePayment(uint256 indexed entryId, string cid, uint256 amount, string tokenSymbol);

	address public owner;
	address public judge;
	address public platformTreasury;
	address public predictionManager;
	address public prizePayout; // set externally; used for settle

	uint16 public constant SCORE_SCALE = 100; // 2 decimals
	uint256 public constant PLATFORM_FEE_BPS = 1000; // 10%
	uint256 public minCreatorStake = 0.01 ether;
	uint256 public minAudienceStake = 0.001 ether; // used in "money mode"

	struct Entry {
		address creator;
		string videoCid; // Synapse hot storage CID
		uint256 creatorStake;
		uint256 totalAudienceStake;
		uint256 createdAt;
		bool finalized;
		uint16 aiScore; // scaled
		bool aiScoreSet;
		uint16 audienceAvgScore; // scaled
		uint16 finalScore; // scaled
		address[] audienceList;
		mapping(address => bool) hasScored;
		mapping(address => uint16) audienceScore; // scaled
		mapping(address => uint256) audienceStake; // wei, 0 if credits mode
	}

	mapping(uint256 => Entry) private entries;
	uint256 public nextEntryId = 1;

	modifier onlyOwner() {
		require(msg.sender == owner, "not owner");
		_;
	}

	modifier onlyOwnerOrJudge() {
		require(msg.sender == owner || msg.sender == judge, "not owner/judge");
		_;
	}

	constructor(address _platformTreasury) {
		require(_platformTreasury != address(0), "treasury required");
		owner = msg.sender;
		platformTreasury = _platformTreasury;
	}

	// Admin
	function setJudge(address _judge) external onlyOwner {
		judge = _judge;
	}

	function setPredictionManager(address _pm) external onlyOwner {
		predictionManager = _pm;
	}

	function setPrizePayout(address _pp) external onlyOwner {
		prizePayout = _pp;
	}

	function setMinStakes(uint256 creatorStakeWei, uint256 audienceStakeWei) external onlyOwner {
		minCreatorStake = creatorStakeWei;
		minAudienceStake = audienceStakeWei;
	}

	// Create a new entry with creator stake and a BlockLock commit
	function createEntry(string calldata videoCid, bytes32 commitHash) external payable returns (uint256 entryId) {
		require(predictionManager != address(0), "prediction manager not set");
		require(msg.value >= minCreatorStake, "stake too low");
		require(bytes(videoCid).length > 0, "cid required");
		entryId = nextEntryId++;
		Entry storage e = entries[entryId];
		e.creator = msg.sender;
		e.videoCid = videoCid;
		e.creatorStake = msg.value;
		e.createdAt = block.timestamp;
		IPredictionManager(predictionManager).commit(entryId, commitHash);
		emit EntryCreated(entryId, msg.sender, videoCid, commitHash, msg.value);
	}

	// Audience submits score; if msg.value > 0 then it's "money mode" (staker participates in payout share),
	// if msg.value == 0 it's "credits mode" (no share in payouts but contributes to audience average).
	function audienceScoreAndStake(uint256 entryId, uint16 scoreScaled) external payable {
		require(scoreScaled <= 10 * SCORE_SCALE, "score > 10.00");
		Entry storage e = entries[entryId];
		require(e.creator != address(0), "no entry");
		require(!e.finalized, "already finalized");
		require(!e.hasScored[msg.sender], "already scored");
		e.hasScored[msg.sender] = true;
		e.audienceScore[msg.sender] = scoreScaled;
		if (msg.value > 0) {
			require(msg.value >= minAudienceStake, "aud stake too low");
			e.audienceStake[msg.sender] = msg.value;
			e.totalAudienceStake += msg.value;
		}
		e.audienceList.push(msg.sender);
		emit AudienceScored(entryId, msg.sender, scoreScaled, msg.value, msg.value == 0);
	}

	function setAIScore(uint256 entryId, uint16 aiScoreScaled) external onlyOwnerOrJudge {
		require(aiScoreScaled <= 10 * SCORE_SCALE, "score > 10.00");
		Entry storage e = entries[entryId];
		require(e.creator != address(0), "no entry");
		e.aiScore = aiScoreScaled;
		e.aiScoreSet = true;
		emit AIScoreSet(entryId, aiScoreScaled);
	}

	// Finalize computes audience average and final score = average(AIScore, AudienceAvgScore).
	function finalize(uint256 entryId) external onlyOwnerOrJudge {
		Entry storage e = entries[entryId];
		require(e.creator != address(0), "no entry");
		require(e.aiScoreSet, "ai not set");
		require(!e.finalized, "already finalized");
		(uint256 sum, uint256 count) = _aggregateAudience(entryId);
		uint16 audienceAvg = count == 0 ? e.aiScore : uint16(sum / count);
		e.audienceAvgScore = audienceAvg;
		uint16 finalScore = uint16((uint256(e.aiScore) + uint256(audienceAvg)) / 2);
		e.finalScore = finalScore;
		e.finalized = true;
		emit EntryFinalized(entryId, audienceAvg, finalScore);
	}

	// Settle sends platform fee to treasury and forwards remainder to prize payout contract.
	// Requires prediction reveal to have occurred.
	function settle(uint256 entryId, bytes calldata conditionalSignature) external onlyOwnerOrJudge {
		require(prizePayout != address(0), "prize payout not set");
		Entry storage e = entries[entryId];
		require(e.creator != address(0), "no entry");
		require(e.finalized, "not finalized");
		require(predictionManager != address(0), "prediction manager not set");
		require(IPredictionManager(predictionManager).isRevealed(entryId), "prediction not revealed");
		uint256 pool = e.creatorStake + e.totalAudienceStake;
		require(pool > 0, "no pool");
		uint256 fee = (pool * PLATFORM_FEE_BPS) / 10000;
		uint256 remainder = pool - fee;
		// Zero out to prevent re-use
		e.creatorStake = 0;
		e.totalAudienceStake = 0;

		(bool ts, ) = payable(platformTreasury).call{value: fee}("");
		require(ts, "fee transfer failed");
		// Call prize payout with remainder
		(bool ps, ) = prizePayout.call{value: remainder}(
			abi.encodeWithSignature("executePayout(uint256,bytes)", entryId, conditionalSignature)
		);
		require(ps, "payout failed");
	}

	// Getters for external contracts
	function isFinalized(uint256 entryId) external view returns (bool) {
		return entries[entryId].finalized;
	}

	function creatorOf(uint256 entryId) external view returns (address) {
		return entries[entryId].creator;
	}

	function getFinalScore(uint256 entryId) external view returns (uint16) {
		return entries[entryId].finalScore;
	}

	function getAIScore(uint256 entryId) external view returns (uint16) {
		return entries[entryId].aiScore;
	}

	function getAudienceList(uint256 entryId) external view returns (address[] memory) {
		return entries[entryId].audienceList;
	}

	function audienceScoreOf(uint256 entryId, address user) external view returns (uint16 scoreScaled, uint256 stakeWei) {
		Entry storage e = entries[entryId];
		scoreScaled = e.audienceScore[user];
		stakeWei = e.audienceStake[user];
	}

	function getPool(uint256 entryId) external view returns (uint256) {
		Entry storage e = entries[entryId];
		return e.creatorStake + e.totalAudienceStake;
	}

	// Optional: emit a chain event when storage is paid off-chain by the agent
	function logStoragePayment(uint256 entryId, string calldata cid, uint256 amount, string calldata tokenSymbol) external onlyOwnerOrJudge {
		require(bytes(cid).length > 0, "cid required");
		require(bytes(tokenSymbol).length > 0, "token required");
		require(entries[entryId].creator != address(0), "no entry");
		emit StoragePayment(entryId, cid, amount, tokenSymbol);
	}

	// Internal aggregation of audience scores (scaled)
	function _aggregateAudience(uint256 entryId) internal view returns (uint256 sum, uint256 count) {
		Entry storage e = entries[entryId];
		address[] storage list = e.audienceList;
		uint256 n = list.length;
		for (uint256 i = 0; i < n; i++) {
			sum += uint256(e.audienceScore[list[i]]);
		}
		count = n;
	}

	// Receive stakes
	receive() external payable {}
}


