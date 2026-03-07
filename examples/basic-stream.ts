import { MockBlockStream, createLogger } from 'hiero-block-bridge';

async function main() {
  const logger = createLogger({ level: 'info' });
  
  // Create a block stream that emits a new block every 2 seconds
  const stream = new MockBlockStream({
    blockIntervalMs: 2000,
    transactionsPerBlock: 3,
    startBlockNumber: 1000,
    network: 'testnet'
  }, logger);

  // Listen for newly generated blocks
  stream.on('block', (block) => {
    console.log(`\n📦 Block #${block.header.number} | Hash: ${block.header.hash}`);
    console.log(`   Transactions included: ${block.items.length}`);
  });

  // Listen for individual transactions within the block
  stream.on('transaction', (tx) => {
    console.log(`   └─ TX: ${tx.transactionId} (${tx.type}) -> ${tx.result}`);
  });

  logger.info('Starting Mock Block Stream...');
  await stream.start();

  // Run the stream for 10 seconds, then stop
  setTimeout(async () => {
    logger.info('Stopping Mock Block Stream...');
    await stream.stop();
    process.exit(0);
  }, 10_000);
}

main().catch(console.error);
