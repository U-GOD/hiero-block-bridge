import { 
  MockBlockStream, 
  QuerySimulator, 
  MirrorNodeFallback, 
  createLogger 
} from 'hiero-block-bridge';

async function main() {
  const logger = createLogger({ level: 'info' });

  // 1. Setup the local mock stream (generates fake local data)
  const stream = new MockBlockStream({ blockIntervalMs: 500 }, logger);
  const querySim = new QuerySimulator({ stream, logger });
  
  // 2. Setup the fallback strategy to query Hedera Testnet
  const fallback = new MirrorNodeFallback({ network: 'testnet', logger });
  fallback.on('mirrorQuery', (event) => {
    logger.info(`Fallback triggered: Fetching from ${event.endpoint}`);
  });

  await stream.start();
  logger.info('Waiting 2 seconds to accumulate some local blocks...');
  await new Promise(r => setTimeout(r, 2000));
  await stream.stop();

  // 3. Query local simulated data
  logger.info('\n--- Querying Local Data ---');
  const localBalance = querySim.getAccountBalance('0.0.2');
  if (localBalance.ok) {
    logger.info(`Local Balance for 0.0.2: ${localBalance.value.balanceTinybars}`);
  }

  // 4. Query data that doesn't exist locally, triggering fallback
  logger.info('\n--- Querying Remote Data (Fallback) ---');
  try {
    const remoteBalance = await fallback.getAccountBalance('0.0.432657');
    logger.info(`Remote Balance for 0.0.432657: ${remoteBalance.balanceTinybars}`);
  } catch (err) {
    logger.error(`Fallback failed: ${err}`);
  }
}

main().catch(console.error);
