// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IRandamuOnlySwaps } from "./interfaces/IRandamuOnlySwaps.sol";

interface ILatentContestRead {
	function getFinalScore(uint256 entryId) external view returns (uint16);
	function getAIScore(uint256 entryId) external view returns (uint16);
	function getAudienceList(uint256 entryId) external view returns (address[] memory);
	function audienceScoreOf(uint256 entryId, address user) external view returns (uint16 scoreScaled, uint256 stakeWei);
	function creatorOf(uint256 entryId) external view returns (address);
}

interface IPredictionRead {
	function isRevealed(uint256 entryId) external view returns (bool);
	function predictedScoreOf(uint256 entryId) external view returns (uint16);
}

contract PrizePayout {
	event PayoutVectorBuilt(uint256 indexed entryId, IRandamuOnlySwaps.Payout[] payouts);
	event OnlySwapsExecuted(uint256 indexed entryId, uint256 totalAmount, address executor);
	event VRFTieBonus(uint256 indexed entryId, address winner, uint256 bonusWei, uint256 tieCount);

	string public constant EIP712_NAME = "Latent.fun";
	string public constant EIP712_VERSION = "1";
	bytes32 public constant PRIZE_RELEASE_TYPEHASH = keccak256("PrizeRelease(uint256 entryId,uint16 finalScore,address contest)");

	uint16 public constant SCORE_SCALE = 100;

	address public owner;
	address public immutable contest;
	address public immutable predictionManager;
	address public randamuOnlySwaps; // can be 0 for local fallback on same-chain
	address public conditionalSigner; // signature authorizer

	// Optional: user cross-chain preferences
	mapping(address => uint256) public preferredChainIdOf; // 0 => current chain

	modifier onlyOwner() {
		require(msg.sender == owner, "not owner");
		_;
	}

	constructor(address contestAddress, address predictionManagerAddress, address conditionalSignerAddress) {
		require(contestAddress != address(0) && predictionManagerAddress != address(0), "addr req");
		owner = msg.sender;
		contest = contestAddress;
		predictionManager = predictionManagerAddress;
		conditionalSigner = conditionalSignerAddress == address(0) ? msg.sender : conditionalSignerAddress;
	}

	function setRandamuOnlySwaps(address addr) external onlyOwner {
		randamuOnlySwaps = addr;
	}

	function setConditionalSigner(address signer) external onlyOwner {
		require(signer != address(0), "zero");
		conditionalSigner = signer;
	}

	function setPreferredChainId(uint256 chainId) external {
		preferredChainIdOf[msg.sender] = chainId;
	}

	function executePayout(uint256 entryId, bytes calldata conditionalSignature) external payable {
		// Verify conditional signature
		uint16 finalScore = ILatentContestRead(contest).getFinalScore(entryId);
		bytes32 structHash = keccak256(abi.encode(PRIZE_RELEASE_TYPEHASH, entryId, finalScore, contest));
		bytes32 digest = _hashTypedDataV4(structHash);
		address recovered = _recover(digest, conditionalSignature);
		require(recovered == conditionalSigner, "bad signature");

		// Validate reveal
		require(IPredictionRead(predictionManager).isRevealed(entryId), "not revealed");

		// Build payouts
		(IRandamuOnlySwaps.Payout[] memory vector, uint256 sum) = _computePayoutVector(entryId, msg.value);
		require(sum == msg.value, "sum mismatch");

		emit PayoutVectorBuilt(entryId, vector);

		if (randamuOnlySwaps != address(0)) {
			IRandamuOnlySwaps(randamuOnlySwaps).executeOnlySwaps{value: msg.value}(vector);
			emit OnlySwapsExecuted(entryId, msg.value, msg.sender);
		} else {
			// Same-chain fallback native transfers
			for (uint256 i = 0; i < vector.length; i++) {
				if (vector[i].chainId == block.chainid && vector[i].amount > 0) {
					(bool s, ) = payable(vector[i].wallet).call{value: vector[i].amount}("");
					require(s, "native xfer fail");
				}
			}
		}
	}

	function _computePayoutVector(uint256 entryId, uint256 poolAfterFee) internal view returns (IRandamuOnlySwaps.Payout[] memory vector, uint256 sum) {
		address creator = ILatentContestRead(contest).creatorOf(entryId);
		uint16 finalScore = ILatentContestRead(contest).getFinalScore(entryId);
		uint16 predicted = IPredictionRead(predictionManager).predictedScoreOf(entryId);
		uint256 diff = _absDiff(finalScore, predicted);

		uint256 creatorBps = 0;
		if (diff <= 10) creatorBps = 6000; // <= 0.1
		else if (diff <= 30) creatorBps = 4000; // <= 0.3
		else if (diff <= 50) creatorBps = 2000; // <= 0.5
		// else 0

		uint256 creatorAmount = (poolAfterFee * creatorBps) / 10000;
		uint256 audiencePool = poolAfterFee - creatorAmount;

		address[] memory audience = ILatentContestRead(contest).getAudienceList(entryId);
		uint16 aiScore = ILatentContestRead(contest).getAIScore(entryId);
		uint256 n = audience.length;

		// First count eligible audience (stakers only) and compute weights by accuracy vs AI score
		uint256[] memory weights = new uint256[](n);
		uint256 totalWeight = 0;
		uint256 minError = type(uint256).max;
		uint256 tieCount = 0;
		for (uint256 i = 0; i < n; i++) {
			( uint16 userScore, uint256 stakeWei ) = ILatentContestRead(contest).audienceScoreOf(entryId, audience[i]);
			if (stakeWei == 0) {
				weights[i] = 0; // credits-only users do not share payouts
				continue;
			}
			uint256 err = _absDiff(aiScore, userScore);
			if (err < minError) {
				minError = err;
				tieCount = 1;
			} else if (err == minError) {
				tieCount += 1;
			}
			// weight = 1e9 / (1 + error) to avoid division by zero and keep relative proportions
			uint256 w = 1_000_000_000 / (1 + err);
			weights[i] = w;
			totalWeight += w;
		}

		// Optional tie-breaker bonus using VRF conceptually: 1% of audience pool goes to a randomly chosen user among minError group.
		// For simplicity here we derive pseudo-randomness from block and entryId; in production, wire an actual VRF coordinator.
		uint256 tieBonus = 0;
		uint256 tieWinnerIndex = type(uint256).max;
		if (tieCount > 1 && audiencePool > 0) {
			tieBonus = audiencePool / 100; // 1% bonus
			// pseudo-vrf fallback: not secure, replace with VRF integration on deployment
			uint256 r = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), address(this), entryId))) % tieCount;
			// find r-th address among minError
			uint256 seen = 0;
			for (uint256 i = 0; i < n; i++) {
				( uint16 userScore2, uint256 stakeWei2 ) = ILatentContestRead(contest).audienceScoreOf(entryId, audience[i]);
				if (stakeWei2 == 0) continue;
				uint256 err2 = _absDiff(aiScore, userScore2);
				if (err2 == minError) {
					if (seen == r) {
						tieWinnerIndex = i;
						break;
					}
					seen++;
				}
			}
		}

		// Build vector: creator + each audience staker
		uint256 totalRecipients = 1 + n;
		vector = new IRandamuOnlySwaps.Payout[](totalRecipients);
		uint256 idx = 0;

		// Creator
		vector[idx++] = IRandamuOnlySwaps.Payout({
			wallet: creator,
			amount: creatorAmount,
			chainId: _chainFor(creator)
		});
		sum += creatorAmount;

		// Audience shares
		if (audiencePool > 0 && totalWeight > 0) {
			uint256 remainingAudiencePool = audiencePool - tieBonus;
			for (uint256 i = 0; i < n; i++) {
				uint256 share = 0;
				if (weights[i] > 0) {
					share = (remainingAudiencePool * weights[i]) / totalWeight;
					// add tie bonus to winner
					if (i == tieWinnerIndex) {
						share += tieBonus;
					}
				}
				vector[idx++] = IRandamuOnlySwaps.Payout({
					wallet: audience[i],
					amount: share,
					chainId: _chainFor(audience[i])
				});
				sum += share;
			}
			if (tieWinnerIndex != type(uint256).max) {
				emit VRFTieBonus(entryId, audience[tieWinnerIndex], tieBonus, tieCount);
			}
		} else {
			// everyone gets 0 in audience
			for (uint256 i = 0; i < n; i++) {
				vector[idx++] = IRandamuOnlySwaps.Payout({
					wallet: audience[i],
					amount: 0,
					chainId: _chainFor(audience[i])
				});
			}
		}
	}

	function _absDiff(uint16 a, uint16 b) internal pure returns (uint256) {
		return a >= b ? uint256(a - b) : uint256(b - a);
	}

	function _chainFor(address user) internal view returns (uint256) {
		uint256 pref = preferredChainIdOf[user];
		return pref == 0 ? block.chainid : pref;
	}

	// --- EIP712 helpers ---
	function _domainSeparatorV4() internal view returns (bytes32) {
		return keccak256(
			abi.encode(
				keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
				keccak256(bytes(EIP712_NAME)),
				keccak256(bytes(EIP712_VERSION)),
				block.chainid,
				address(this)
			)
		);
	}

	function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
		return keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash));
	}

	function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
		require(sig.length == 65, "sig len");
		bytes32 r;
		bytes32 s;
		uint8 v;
		assembly {
			r := mload(add(sig, 0x20))
			s := mload(add(sig, 0x40))
			v := byte(0, mload(add(sig, 0x60)))
		}
		if (v < 27) v += 27;
		require(v == 27 || v == 28, "bad v");
		return ecrecover(digest, v, r, s);
	}
}


