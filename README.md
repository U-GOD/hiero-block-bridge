<p align="center">
  <img src="https://img.shields.io/badge/Hiero-Block%20Bridge-6C63FF?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlnb24gcG9pbnRzPSIxMyAyIDMgMTQgMTIgMTQgMTEgMjIgMjEgMTAgMTIgMTAgMTMgMiI+PC9wb2x5Z29uPjwvc3ZnPg==&logoColor=white" alt="HieroBlockBridge" />
</p>

<h1 align="center">HieroBlockBridge</h1>

<p align="center">
  <strong>A modular TypeScript library for simulating and automating Hedera Block Node access</strong>
</p>

<p align="center">
  <a href="https://github.com/U-GOD/hiero-block-bridge/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/U-GOD/hiero-block-bridge/ci.yml?branch=main&style=flat-square&label=CI" alt="CI Status" /></a>
  <a href="https://www.npmjs.com/package/hiero-block-bridge"><img src="https://img.shields.io/npm/v/hiero-block-bridge?style=flat-square&color=6C63FF" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/hiero-block-bridge"><img src="https://img.shields.io/npm/dm/hiero-block-bridge?style=flat-square" alt="npm downloads" /></a>
  <a href="https://codecov.io/gh/U-GOD/hiero-block-bridge"><img src="https://img.shields.io/codecov/c/github/U-GOD/hiero-block-bridge?style=flat-square" alt="Coverage" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" /></a>
  <a href="https://github.com/U-GOD/hiero-block-bridge/blob/main/CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" /></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#modules">Modules</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#examples">Examples</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

**HieroBlockBridge** enables Hedera developers to test and integrate [Block Node](https://hedera.com/blog/hedera-block-nodes-in-private-preview) features locally — without full self-hosting or waiting for third-party provider support. It bridges the gap during the 2025–2026 transition from legacy Mirror Nodes to the new Block Node architecture defined in [HIP-1056 (Block Streams)](https://hips.hedera.com/hip/hip-1056) and [HIP-1081 (Block Nodes)](https://hips.hedera.com/hip/hip-1081).

Block Nodes are a new Hedera node type offering faster, cheaper, and more decentralized data access — including live block streaming, state proofs, and on-demand historical data retrieval. HieroBlockBridge lets you develop against these capabilities today.

### Why HieroBlockBridge?

| Problem | Solution |
|---|---|
| Block Nodes are in phased rollout — providers like QuickNode don't support them yet | **Local Simulator** mocks Block Node endpoints with realistic data |
| Self-hosting a Block Node requires significant hardware and configuration | **Setup Automator** handles Docker/Solo bootstrapping and health checks |
| APIs are deprecating (e.g., `AccountBalanceQuery` removed July 2026) | **Migration Helpers** scan your code and suggest fixes automatically |
| No local testing path for Block Stream integrations | **Mock Streams** generate realistic block data at configurable intervals |
| Mirror Node → Block Node migration is opaque | **Auto-fallback** transparently routes queries during the transition |

> [!NOTE]
> This project is built for the [Hedera Hello Future Apex Hackathon 2026](https://hellofuturehackathon.dev) — Hiero bounty. It is designed as a **reusable, production-minded library** (not a demo app) following open-source best practices inspired by [hiero-enterprise-java](https://github.com/OpenElements/hiero-enterprise-java).

---

## Features

-  **Block Stream Simulator** — Mock HIP-1056 Block Streams locally with configurable block intervals, transaction types, and failure injection
-  **Query Simulator** — Simulate Block Node query endpoints (`getBlock`, `getTransaction`, `getStateProof`, `getAccountBalance`) with in-memory data
-  **Mirror Node Fallback** — Auto-fallback to Hedera Mirror Node REST API when Block Node endpoints are unavailable
-  **Setup Automator** — Docker and Hedera Solo CLI tooling to spin up local/testnet Block Nodes
-  **Deprecation Detector** — Scan your codebase for deprecated Hedera APIs with auto-fix suggestions
-  **Throttle Monitor** — Track API usage rates against known throttle limits
-  **Health Checks** — Monitor Block Node and Mirror Node availability
-  **Hardware Validator** — Check system resources against Block Node minimum specs
-  **AI Config Tuner** — AI-assisted configuration optimization for cost-efficient querying
-  **EVM Compatible** — Works with Solidity dApps via Hedera's EVM compatibility

---

## Installation

### Prerequisites

- **Node.js** ≥ 20 LTS
- **npm** ≥ 10 (or yarn/pnpm)
- **Docker** (optional — required only for the Setup Automator module)

### Install

```bash
npm install hiero-block-bridge
```

```bash
# or with yarn
yarn add hiero-block-bridge

# or with pnpm
pnpm add hiero-block-bridge
```

### Peer Dependencies

HieroBlockBridge uses the official [Hedera JavaScript SDK](https://github.com/hashgraph/hedera-sdk-js) under the hood. If your project doesn't already include it:

```bash
npm install @hashgraph/sdk
```

---

## Quick Start

### 1. Stream Mock Blocks

Subscribe to a local mock Block Stream that generates realistic block data matching Hedera's ~2-second block interval:

```typescript
import { MockBlockStream } from 'hiero-block-bridge';

const stream = new MockBlockStream({
  blockIntervalMs: 2000,
  transactionsPerBlock: 5,
  network: 'testnet',
});

stream.on('block', (block) => {
  console.log(`Block #${block.header.number}`);
  console.log(`  Transactions: ${block.items.length}`);
  console.log(`  Timestamp: ${block.header.timestamp}`);
});

stream.on('transaction', (tx) => {
  console.log(`Transaction ${tx.transactionId}: ${tx.type}`);
});

await stream.start();

// Stop after 30 seconds
setTimeout(() => stream.stop(), 30_000);
```

### 2. Query Simulated Block Node Data

Use the unified bridge client to query Block Node data — with automatic fallback to Mirror Node when needed:

```typescript
import { createBridge } from 'hiero-block-bridge';

const bridge = createBridge({
  network: 'testnet',
  fallback: 'auto', // Falls back to Mirror Node if Block Node unavailable
});

// Query account balance (works via Block Node, simulator, or Mirror Node)
const balance = await bridge.getAccountBalance('0.0.100');
console.log(`Balance: ${balance.hbars} ℏ`);

// Fetch a specific block
const block = await bridge.getBlock(12345);
console.log(`Block hash: ${block.header.hash}`);

// Get a state proof
const proof = await bridge.getStateProof('0.0.100');
console.log(`State proof verified: ${proof.verified}`);
```

### 3. Scan for Deprecated APIs

Detect deprecated Hedera API usage in your project before breaking changes hit:

```typescript
import { DeprecationDetector } from 'hiero-block-bridge';

const detector = new DeprecationDetector();
const report = await detector.scanDirectory('./src', '**/*.ts');

for (const issue of report.issues) {
  console.log(`${issue.severity} ${issue.file}:${issue.line}`);
  console.log(`  ${issue.api} — deprecated since ${issue.deprecatedSince}`);
  console.log(`  Fix: ${issue.replacement}`);
}

// Example output:
// ⚠ WARNING src/services/account.ts:42
//   AccountBalanceQuery — deprecated since 2026-05-01, removed 2026-07-01
//   Fix: Use Mirror Node REST API: GET /api/v1/balances?account.id={id}
```

---

## Modules

HieroBlockBridge is organized into focused modules that can be imported individually for tree-shaking:

```
hiero-block-bridge
├── @core          — SDK client wrapper, config, logging, events
├── @simulator     — Block Stream mock, query simulator, Mirror Node fallback
├── @automator     — Docker management, Solo CLI, health checks, hardware validation
├── @migration     — Deprecation detection, throttle monitoring, code fixes
└── @ai            — AI-assisted config tuning, cost optimization
```

### Core

The foundation layer providing a managed Hedera SDK client, typed event system, structured logging, and network configuration.

```typescript
import { HieroClient } from 'hiero-block-bridge';

const client = new HieroClient({
  network: 'testnet',
  operatorId: process.env.HEDERA_ACCOUNT_ID,
  operatorKey: process.env.HEDERA_PRIVATE_KEY,
});

await client.connect();
const info = await client.getNetworkInfo();
console.log(`Connected to ${info.network} (${info.nodeCount} nodes)`);
```

### Simulator

The flagship module. Mocks Block Node endpoints locally so you can develop and test Block Stream integrations without running real infrastructure.

#### MockBlockStream

```typescript
import { MockBlockStream } from 'hiero-block-bridge';

const stream = new MockBlockStream({
  blockIntervalMs: 2000,      // Generate a block every 2 seconds
  transactionsPerBlock: 5,     // 5 transactions per block
  network: 'testnet',
  enableStateProofs: true,     // Include state proofs in blocks
  failureRate: 0.01,           // 1% chance of injected failures (for resilience testing)
});

// Subscribe to events
stream.on('block', (block) => { /* ... */ });
stream.on('transaction', (tx) => { /* ... */ });
stream.on('stateChange', (change) => { /* ... */ });
stream.on('error', (err) => { /* ... */ });

// Lifecycle
await stream.start();
stream.pause();
stream.resume();
await stream.seek(100);   // Jump to block #100
await stream.stop();
```

#### QuerySimulator

```typescript
import { QuerySimulator } from 'hiero-block-bridge';

const sim = new QuerySimulator({ network: 'testnet' });
await sim.initialize();

const block = await sim.getBlock(42);
const tx = await sim.getTransaction('0.0.100@1709000000.000000000');
const proof = await sim.getStateProof('0.0.100');
const balance = await sim.getAccountBalance('0.0.100');
```

#### Mirror Node Fallback

```typescript
import { createBridge } from 'hiero-block-bridge';

const bridge = createBridge({
  network: 'testnet',
  fallback: 'auto',        // 'auto' | 'manual' | 'disabled'
  mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
});

// Transparent — uses Block Node if available, Mirror Node otherwise
const balance = await bridge.getAccountBalance('0.0.100');

// Check which data source was used
bridge.on('fallback', (event) => {
  console.log(`Query routed to ${event.source}: ${event.reason}`);
});
```

### Automator

Tools to bootstrap and manage local Block Node environments.

#### Docker Management

```typescript
import { DockerManager } from 'hiero-block-bridge';

const docker = new DockerManager({
  workDir: './local-node',
  ports: { grpc: 50211, rest: 5551 },
});

await docker.up();                    // Start containers
const health = await docker.health(); // Check readiness
const logs = await docker.logs();     // Stream container logs
await docker.down();                  // Stop and clean up
```

#### Hardware Validation

```typescript
import { checkHardware } from 'hiero-block-bridge';

const report = await checkHardware();
console.log(report);
// {
//   cpu: { cores: 8, status: 'pass' },
//   memory: { totalGb: 16, availableGb: 12, status: 'pass' },
//   disk: { availableGb: 100, status: 'pass' },
//   docker: { installed: true, running: true, status: 'pass' },
//   overall: 'pass'
// }
```

#### Health Checks

```typescript
import { waitForReady, checkBlockNodeHealth } from 'hiero-block-bridge';

// Wait for a Block Node to become available (with timeout)
await waitForReady('http://localhost:5551', { timeoutMs: 60_000 });

// One-shot health check
const status = await checkBlockNodeHealth('http://localhost:5551');
console.log(`Block Node: ${status.healthy ? '✓ Online' : '✗ Offline'}`);
```

### Migration

Detect and fix deprecated Hedera APIs ahead of breaking changes.

#### Deprecation Registry

The library includes a maintained registry of known Hedera API deprecations and their migration paths:

| API | Deprecated | Removed | Replacement |
|---|---|---|---|
| `AccountBalanceQuery` | May 2026 | July 2026 | Mirror Node REST: `GET /api/v1/balances` |
| Record file format | Feb 2026 | June 2026 | HIP-1056 Block Streams |
| Cloud bucket ingestion | Q2 2026 | Q3 2026 | Direct Block Node subscription |

#### Throttle Monitor

```typescript
import { ThrottleMonitor } from 'hiero-block-bridge';

const monitor = new ThrottleMonitor({ network: 'testnet' });

monitor.on('warning', (event) => {
  console.log(`Approaching limit: ${event.api} at ${event.usage}/${event.limit}`);
});

monitor.on('throttled', (event) => {
  console.log(`THROTTLED: ${event.api} — retry after ${event.retryAfterMs}ms`);
});

await monitor.start();
```

### AI Optimization

AI-assisted configuration tuning for cost-efficient querying.

```typescript
import { ConfigTuner } from 'hiero-block-bridge';

const tuner = new ConfigTuner({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});

const suggestions = await tuner.analyze({
  queryPatterns: ['balance-checks', 'transaction-history'],
  volume: 'high',
  budget: 'low',
});

for (const suggestion of suggestions) {
  console.log(`${suggestion.title} (confidence: ${suggestion.confidence})`);
  console.log(`  ${suggestion.description}`);
  console.log(`  Estimated savings: ${suggestion.estimatedSavings}`);
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       hiero-block-bridge (npm)                      │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │  Simulator   │  │  Automator   │  │  Migration   │  │   AI    │ │
│  │              │  │              │  │              │  │         │ │
│  │ • MockBlock  │  │ • DockerMgr  │  │ • Deprecation│  │ • Config│ │
│  │   Stream     │  │ • SoloRunner │  │   Detector   │  │   Tuner │ │
│  │ • QuerySim   │  │ • HealthChk  │  │ • CodeFixer  │  │ • Cost  │ │
│  │ • MirrorFall │  │ • HW Check   │  │ • Throttle   │  │   Opt   │ │
│  │   back       │  │ • ConfigGen  │  │   Monitor    │  │         │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬────┘ │
│         │                 │                 │                │      │
│  ┌──────┴─────────────────┴─────────────────┴────────────────┴────┐ │
│  │                           Core                                 │ │
│  │  • HieroClient (SDK wrapper)   • BlockStreamTypes (HIP-1056)   │ │
│  │  • NetworkConfig               • EventEmitter (typed events)   │ │
│  │  • Logger (structured)         • ErrorCodes & custom errors    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                         Types                                  │ │
│  │  • BlockItem, BlockHeader, BlockProof, StateProof              │ │
│  │  • Config interfaces, Result<T,E> monad, branded types         │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
  Hedera Network (Consensus Nodes)
         │
         ▼
  ┌──────────────┐     ┌───────────────┐
  │  Block Node  │◄───►│ Mirror Node   │
  │  (HIP-1081)  │     │  (REST API)   │
  └──────┬───────┘     └───────┬───────┘
         │                     │
         ▼                     ▼
  ┌──────────────────────────────────────┐
  │       HieroBlockBridge               │
  │                                      │
  │  Live Mode ◄──► Simulator Mode       │
  │       │              │               │
  │       ▼              ▼               │
  │  ┌─────────┐  ┌─────────────┐       │
  │  │  Real   │  │  Mock Block │       │
  │  │  Block  │  │   Stream    │       │
  │  │  Stream │  │  (local)    │       │
  │  └────┬────┘  └──────┬──────┘       │
  │       │              │               │
  │       └──────┬───────┘               │
  │              ▼                       │
  │    Unified Query Interface           │
  │    (with auto-fallback)              │
  └──────────────┬───────────────────────┘
                 │
                 ▼
          Developer Application
          (dApps, DeFi, Data Pipelines)
```

---

## Configuration

### Environment Variables

HieroBlockBridge reads configuration from environment variables. Create a `.env` file in your project root:

```env
# Required for live network interactions
HEDERA_ACCOUNT_ID=0.0.12345
HEDERA_PRIVATE_KEY=302e020100300506032b657004220420...
HEDERA_NETWORK=testnet

# Optional
HIERO_BRIDGE_LOG_LEVEL=info          # debug | info | warn | error
HIERO_BRIDGE_MIRROR_URL=https://testnet.mirrornode.hedera.com
HIERO_BRIDGE_FALLBACK=auto           # auto | manual | disabled
```

> [!WARNING]
> Never commit your `.env` file or private keys to version control. The `.gitignore` file in this project already excludes `.env` files.

### Programmatic Configuration

```typescript
import { createBridge } from 'hiero-block-bridge';

const bridge = createBridge({
  network: 'testnet',
  operatorId: '0.0.12345',
  operatorKey: '302e020100300506032b657004220420...',
  simulator: {
    enabled: true,
    blockIntervalMs: 2000,
    transactionsPerBlock: 5,
  },
  fallback: 'auto',
  logging: {
    level: 'info',
    pretty: true,
  },
});
```

---

## Examples

Complete, runnable examples are available in the [`examples/`](./examples) directory:

| Example | Description |
|---|---|
| [`basic-stream.ts`](./examples/basic-stream.ts) | Subscribe to a mock Block Stream and log events |
| [`query-with-fallback.ts`](./examples/query-with-fallback.ts) | Query data with automatic Mirror Node fallback |
| [`migration-scan.ts`](./examples/migration-scan.ts) | Scan a project for deprecated Hedera APIs |
| [`docker-setup.ts`](./examples/docker-setup.ts) | Programmatically set up a local Block Node environment |
| [`solidity-integration/`](./examples/solidity-integration/) | Deploy and query a Solidity smart contract via the bridge |

### Running Examples

```bash
# Clone the repository
git clone https://github.com/U-GOD/hiero-block-bridge.git
cd hiero-block-bridge

# Install dependencies
npm install

# Run an example
npx tsx examples/basic-stream.ts
```

---

## Solidity / EVM Integration

HieroBlockBridge is designed to work with Hedera's EVM compatibility layer. Solidity developers porting dApps from Ethereum can use the bridge to test Hedera-specific features alongside standard EVM tooling.

```typescript
import { createBridge } from 'hiero-block-bridge';
import { ContractFactory } from '@hashgraph/sdk';

const bridge = createBridge({ network: 'testnet' });

// Deploy a Solidity contract and query it through the bridge
const contractId = await bridge.deployContract({
  bytecode: '0x608060...',
  gas: 100_000,
});

// Query contract state via Block Node (or fallback to Mirror Node)
const result = await bridge.callContract({
  contractId,
  functionName: 'getValue',
  gas: 30_000,
});
```

See the full [Solidity integration example](./examples/solidity-integration/) for a step-by-step walkthrough.

---

## API Reference

Full API documentation is auto-generated from source using [TypeDoc](https://typedoc.org):

```bash
# Generate API docs locally
npm run docs

# Open in browser
open docs/index.html
```

### Key Exports

```typescript
// Simulator
export { MockBlockStream } from './simulator/mock-stream';
export { QuerySimulator } from './simulator/query-sim';
export { MirrorNodeFallback } from './simulator/mirror-fallback';

// Automator
export { DockerManager } from './automator/docker';
export { SoloRunner } from './automator/solo-runner';
export { checkHardware } from './automator/hardware-check';
export { checkBlockNodeHealth, waitForReady } from './automator/health';

// Migration
export { DeprecationDetector } from './migration/detector';
export { ThrottleMonitor } from './migration/throttle-monitor';
export { DEPRECATION_RULES } from './migration/deprecation-rules';

// AI
export { ConfigTuner } from './ai/config-tuner';
export { CostOptimizer } from './ai/cost-optimizer';

// Core
export { HieroClient } from './core/client';
export { createBridge } from './core/bridge';

// Types
export type { BlockItem, BlockHeader, BlockProof, StateProof } from './types/block';
export type { BridgeConfig, SimulatorOptions, NetworkConfig } from './types/config';
```

---

## Development

### Setup

```bash
git clone https://github.com/U-GOD/hiero-block-bridge.git
cd hiero-block-bridge
npm install
```

### Scripts

| Command | Description |
|---|---|
| `npm run build` | Build ESM + CJS bundles with type declarations |
| `npm run dev` | Watch mode for development |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |
| `npm run typecheck` | TypeScript type checking |
| `npm run docs` | Generate API documentation |

### Project Structure

```
hiero-block-bridge/
├── src/
│   ├── index.ts                # Main barrel export
│   ├── types/                  # TypeScript type definitions
│   │   ├── block.ts            # Block, transaction, proof types
│   │   ├── config.ts           # Configuration interfaces
│   │   ├── result.ts           # Result<T,E> monad
│   │   └── errors.ts           # Error codes and custom errors
│   ├── core/                   # Foundation layer
│   │   ├── client.ts           # HieroClient SDK wrapper
│   │   ├── network.ts          # Network configuration
│   │   ├── logger.ts           # Structured logging
│   │   └── events.ts           # Typed event emitter
│   ├── simulator/              # Block Node simulation
│   │   ├── mock-stream.ts      # Mock Block Stream
│   │   ├── query-sim.ts        # Query simulator
│   │   └── mirror-fallback.ts  # Mirror Node fallback
│   ├── automator/              # Environment setup tools
│   │   ├── docker.ts           # Docker management
│   │   ├── solo-runner.ts      # Hedera Solo CLI wrapper
│   │   ├── health.ts           # Health checks
│   │   └── hardware-check.ts   # System resource validation
│   ├── migration/              # API migration helpers
│   │   ├── deprecation-rules.ts
│   │   ├── detector.ts         # Deprecation scanner
│   │   └── throttle-monitor.ts
│   └── ai/                     # AI-assisted optimization
│       ├── config-tuner.ts
│       └── cost-optimizer.ts
├── tests/                      # Test suites
│   ├── unit/                   # Unit tests (mirrors src/ structure)
│   ├── integration/            # End-to-end tests
│   └── fixtures/               # Test data and mock files
├── examples/                   # Runnable examples
├── docker/                     # Docker Compose templates
├── docs/                       # Generated API documentation
├── .github/                    # CI workflows, issue/PR templates
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── CHANGELOG.md
└── LICENSE
```

---

## Built With

- [Hedera JavaScript SDK](https://github.com/hashgraph/hedera-sdk-js) — Official SDK for Hedera network interactions
- [TypeScript](https://www.typescriptlang.org/) — Type-safe JavaScript
- [tsup](https://tsup.egoist.dev/) — Fast TypeScript bundler (ESM + CJS)
- [Vitest](https://vitest.dev/) — Fast test runner with native TypeScript support
- [Zod](https://zod.dev/) — Runtime type validation
- [pino](https://getpino.io/) — Fast structured logging
- [TypeDoc](https://typedoc.org/) — API documentation generator

---

## Related Projects & References

- [Hiero Block Node](https://github.com/hiero-ledger/hiero-block-node) — The official Block Node implementation (HIP-1081)
- [Hiero Enterprise Java](https://github.com/OpenElements/hiero-enterprise-java) — Java modules for Spring/Microprofile integration with Hiero networks
- [Hedera Local Node](https://docs.hedera.com/hedera/tutorials/local-node/setup-hedera-node-cli-npm) — Hedera's local network CLI
- [HIP-1056: Block Streams](https://hips.hedera.com/hip/hip-1056) — Specification for the unified data stream format
- [HIP-1081: Block Nodes](https://hips.hedera.com/hip/hip-1081) — Specification for Block Node data lake architecture
- [Hedera Block Nodes Blog](https://hedera.com/blog/hedera-block-nodes-in-private-preview) — Overview of the private preview deployment
- [Hedera Developer Highlights (Jan 2026)](https://hedera.com/blog/developer-highlights-january-2026) — API deprecation timeline

---

## Roadmap

- [x] Core type system and SDK client wrapper
- [x] Mock Block Stream simulator
- [x] Query simulator with Mirror Node fallback
- [ ] Setup Automator (Docker + Solo CLI)
- [ ] Deprecation detector and migration helpers
- [ ] AI-assisted configuration optimization
- [ ] VS Code extension for inline deprecation warnings
- [ ] Plugin system for third-party extensions
- [ ] Real Block Node integration (post-community access)
- [ ] Benchmarking suite (Block Node vs. Mirror Node vs. consensus)

---

## Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or improving documentation — every contribution matters.

Please read our [Contributing Guide](./CONTRIBUTING.md) before submitting a pull request. Key points:

- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
- All commits must include a DCO sign-off (`Signed-off-by: Your Name <email>`)
- GPG-signed commits are encouraged
- PRs require passing CI checks and at least one review
- See the [Code of Conduct](./CODE_OF_CONDUCT.md) for community guidelines

```bash
# Sign-off your commits
git commit -s -m "feat: add new query type"

# GPG sign your commits
git commit -S -s -m "feat: add new query type"
```

---

## Security

If you discover a security vulnerability, please follow our [Security Policy](./SECURITY.md) for responsible disclosure. **Do not open a public issue for security vulnerabilities.**

---

## License

This project is licensed under the [MIT License](./LICENSE).

Copyright © 2026 [devFred](https://github.com/U-GOD)

---

<p align="center">
  Built with ♥ for the Hedera developer community
  <br />
  <a href="https://hiero.org">Hiero</a> •
  <a href="https://hedera.com">Hedera</a> •
  <a href="https://hellofuturehackathon.dev">Hello Future Hackathon 2026</a>
</p>
