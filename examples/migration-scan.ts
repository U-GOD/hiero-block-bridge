import { DeprecationDetector, createLogger } from 'hiero-block-bridge';

async function main() {
  const logger = createLogger({ level: 'info' });

  // Scan the current directory's src folder for deprecated Hedera SDK usage
  const detector = new DeprecationDetector({ minSeverity: 'warning' }, logger);
  
  logger.info('Scanning ./src for deprecations...');
  
  try {
    const report = await detector.scanDirectory('./src', '**/*.ts');
    
    // Output standard CLI-friendly report
    console.log(DeprecationDetector.formatReport(report));

    if (report.totalMatches > 0) {
      process.exit(1); // Fail a CI pipeline if matches exist
    }

  } catch (err) {
    logger.error('Failed scanning directory', err);
  }
}

main().catch(console.error);
