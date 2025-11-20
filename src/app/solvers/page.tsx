"use client";
import { useEffect, useState } from "react";

type SolverEvent = {
	timestamp: number;
	entryId: string;
	type: "attempt" | "winner";
	solver?: string;
	priceImpactBps?: number;
	route?: string;
};

export default function SolversPage() {
	const [events, setEvents] = useState<SolverEvent[]>([]);
	useEffect(() => {
		(async () => {
			try {
				const res = await fetch("/api/payout?events=1");
				if (res.ok) {
					const data = await res.json();
					setEvents(data?.events || []);
				}
			} catch {}
		})();
	}, []);
	return (
		<main className="row">
			<div className="col" style={{ flexBasis: "100%" }}>
				<div className="card">
					<h2>Randamu Super Solver dashboard</h2>
					<p>Shows attempted swap routes, competing solvers, and winning route.</p>
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<thead>
							<tr>
								<th style={{ textAlign: "left" }}>Time</th>
								<th style={{ textAlign: "left" }}>Entry</th>
								<th style={{ textAlign: "left" }}>Type</th>
								<th style={{ textAlign: "left" }}>Solver</th>
								<th style={{ textAlign: "left" }}>Route</th>
								<th style={{ textAlign: "left" }}>Price Δ (bps)</th>
							</tr>
						</thead>
						<tbody>
							{events.map((e, i) => (
								<tr key={i}>
									<td>{new Date(e.timestamp).toLocaleTimeString()}</td>
									<td>#{e.entryId}</td>
									<td>{e.type}</td>
									<td>{e.solver || "-"}</td>
									<td>{e.route || "-"}</td>
									<td>{e.priceImpactBps ?? "-"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</main>
	);
}


