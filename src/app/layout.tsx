export const metadata = {
	title: "Tango.fun — AI Talent Competition",
	description: "Unfold Your Talent: Showcase, Get Scored (and Roasted), Bet, and Earn with AI & Audience Power!"
};

import "./globals.css";
import { Providers } from "@/providers";
import Header from "@/components/Header";

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-screen">
				<Providers>
					{children}
				</Providers>
			</body>
		</html>
	);
}
