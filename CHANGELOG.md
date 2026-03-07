# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-05

### Added
- **Core Simulator** (`@simulator`): `MockBlockStream` for emitting HIP-1056 block data and `QuerySimulator` for providing historical and local queries (e.g. `getBlock`, `getTransaction`, `getAccountBalance`).
- **Mirror Node Fallback** (`@simulator`): `MirrorNodeFallback` to intelligently query a Hedera Mirror Node when local simulated block data isn't available.
- **Automator** (`@automator`): `DockerManager` to handle spinning up and tearing down local block/mirror nodes via Docker Compose.
- **Health & Hardware** (`@automator`): System readiness validation via `checkHardware` and readiness polling with `waitForReady`.
- **Migration & Scanning** (`@migration`): `DeprecationDetector` to scan codebases for legacy API patterns (e.g., `AccountBalanceQuery`) and suggest HIP-1056/HIP-1081 alternatives.
- **Throttle Monitor** (`@migration`): `ThrottleMonitor` to passively measure call rates against predefined system rate limits.
- **Core Abstractions** (`@core`): `HieroClient` for unified Hedera SDK connections and custom Pino `createLogger` configurations.
- Full GitHub Actions continuous integration (CI) pipeline providing linting, type-checking, building, and reporting coverage via Vitest.
- Release workflow utilizing GitHub Action provenance for secure npm publishing.
- Example integrations to assist developers in getting started.
