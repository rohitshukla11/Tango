import { ethers } from "hardhat";

async function main() {
  const contestAddress = process.env.CONTEST_ADDRESS ?? "0x69e3A6856ef324205D67CAA4F16220436f324f45";
  const predictionManagerAddress = process.env.NEW_PREDICTION_MANAGER ?? "0xeaf585aca636847a81db9befebf44eaf85d374bd";

  if (!contestAddress || !predictionManagerAddress) {
    throw new Error("Missing contest or prediction manager address");
  }

  console.log("Using contest:", contestAddress);
  console.log("Setting prediction manager to:", predictionManagerAddress);

  const contest = await ethers.getContractAt("LatentContest", contestAddress);

  const tx = await contest.setPredictionManager(predictionManagerAddress);
  console.log("Transaction submitted:", tx.hash);

  await tx.wait();
  console.log("Prediction manager updated.");

  const saved = await contest.predictionManager();
  console.log("New stored prediction manager:", saved);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
