"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { injected } from "@wagmi/connectors";
import { scrollSepolia } from "wagmi/chains";
import "@rainbow-me/rainbowkit/styles.css";

// Scroll L2 (for staking/predictions)
const scrollRpc = process.env.NEXT_PUBLIC_STAKING_RPC_URL || "https://sepolia-rpc.scroll.io";

const chains = [scrollSepolia];

const config = createConfig({
    // @ts-ignore - chains array is valid tuple at runtime
    chains,
    connectors: [
        injected({
            target: "metaMask",
            shimDisconnect: true
        })
    ],
    transports: {
        [scrollSepolia.id]: http(scrollRpc, {
            batch: false,
            retryCount: 3,
            retryDelay: 1_000
        })
    },
    ssr: true
});

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false
        }
    }
});

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider initialChain={scrollSepolia} modalSize="compact">
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
