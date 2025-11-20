"use client";
import { useEffect, useState } from "react";

export default function ProfilePage({ params }: { params: { wallet: string } }) {
	const wallet = params.wallet;
	const [cids, setCids] = useState<string[]>([]);
	useEffect(() => {
		// Placeholder: pull from your index or subgraph; here we use localStorage
		const key = `latent:cids:${wallet}`;
		try {
			const raw = localStorage.getItem(key);
			if (raw) setCids(JSON.parse(raw));
		} catch {}
	}, [wallet]);

	return (
		<main className="row">
			<div className="col" style={{ flexBasis: "100%" }}>
				<div className="card">
					<h2>Portfolio for {wallet}</h2>
					<ul>
						{cids.map((cid, idx) => (
							<li key={idx}><code>{cid}</code></li>
						))}
					</ul>
					{!cids.length && <p>No Filecoin CIDs tracked locally.</p>}
				</div>
			</div>
		</main>
	);
}


