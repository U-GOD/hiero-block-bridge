# Hedera EVM Compatibility

Hedera is fully EVM compatible.

When testing smart contracts locally, developers can rely on the **HieroBlockBridge** Query Simulator and Mirror Node Fallback to resolve accounts mapping to their EVM addresses, allowing normal JSON-RPC tooling (ethers.js, hardhat) to be layered right on top if an RPC relay is also pointed at the local simulator or testnet.
