"use client";
import { useState } from "react";

export default function EntryPage({ params }: { params: { id: string } }) {
	const entryId = params.id;
	const [score, setScore] = useState<string>("5.0");
	const [stake, setStake] = useState<string>("0.01"); // FIL
	const [status, setStatus] = useState<string>("");

	function toScaled(v: number) { return Math.round(Math.max(0, Math.min(10, v)) * 100); }

	async function submitScoreMoney() {
		const scaled = toScaled(parseFloat(score));
		setStatus(`Would submit on-chain: audienceScoreAndStake(${entryId}, ${scaled}) with stake ${stake} FIL`);
		// Implement with wallet integration (wagmi) to call contract method.
	}

	async function submitScoreCredits() {
		const scaled = toScaled(parseFloat(score));
		setStatus(`Would submit credits-mode score: audienceScoreAndStake(${entryId}, ${scaled}) with 0 stake`);
	}

	return (
		<main className="row">
			<div className="col">
				<div className="card">
					<h2>Entry #{entryId}</h2>
					<p>Video streamed via Synapse hot storage (CID known to the contract manifest).</p>
					<div style={{ background: "#f9fafb", height: 240, display: "grid", placeItems: "center", borderRadius: 8 }}>
						<small>Player placeholder</small>
					</div>
				</div>
			</div>
			<div className="col">
				<div className="card">
					<h3>Audience score</h3>
					<label>Score (0–10):
						<input type="number" min="0" max="10" step="0.01" value={score} onChange={e => setScore(e.target.value)} />
					</label>
					<div style={{ marginTop: 8 }}>
						<label>Stake (FIL): <input type="number" step="0.001" value={stake} onChange={e => setStake(e.target.value)} /></label>
					</div>
					<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
						<button onClick={submitScoreMoney}>Submit (money mode)</button>
						<button onClick={submitScoreCredits}>Submit (India credits mode)</button>
					</div>
				</div>
			</div>
			{status && (
				<div className="col" style={{ flexBasis: "100%" }}>
					<div className="card"><p><strong>Status:</strong> {status}</p></div>
				</div>
			)}
		</main>
	);
}


