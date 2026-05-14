# Test Against Hedera Block Streams in 90 Seconds

Hedera is transitioning to a new Block Stream architecture (HIP-1056). If you're building a DApp, wallet, or analytics tool, you'll need to handle this new data format — but setting up a local Block Node is painful.

**HieroBlockBridge** lets you skip all of that and start testing instantly.

## Install

```bash
npm install hiero-block-bridge
```

## Create `app.js`

```javascript
import { MockBlockStream, createLogger } from 'hiero-block-bridge';

const logger = createLogger({ level: 'info' });
const stream = new MockBlockStream({ blockIntervalMs: 2000 }, logger);

stream.on('block', (block) => {
  console.log(`Block #${block.header.number} | ${block.items.length} transactions`);

  for (const tx of block.items) {
    if (tx.type === 'ContractCall') {
      console.log(`  Smart contract triggered: ${tx.transactionId}`);
    }
  }
});

await stream.start();
```

## Run it

```bash
node app.js
```

That's it. You now have a simulated Hedera Block Stream running locally — no internet, no Docker, no API keys.

Every 2 seconds, a new block arrives with realistic transactions. Write your business logic inside the `stream.on('block')` callback and test your app exactly like it will work against the real network.

## What's next?

- Scan your existing codebase for deprecated APIs: `npx tsx examples/migration-scan.ts`
- Read the full docs: [github.com/U-GOD/hiero-block-bridge](https://github.com/U-GOD/hiero-block-bridge)
- Install from npm: [npmjs.com/package/hiero-block-bridge](https://www.npmjs.com/package/hiero-block-bridge)
