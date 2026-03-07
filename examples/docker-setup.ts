import { DockerManager, checkHardware, formatHardwareReport, createLogger } from 'hiero-block-bridge';

async function main() {
  const logger = createLogger({ level: 'info' });

  // 1. Verify system resources can handle a Block Node
  const specs = await checkHardware();
  console.log(formatHardwareReport(specs));

  if (specs.overall === 'fail') {
    logger.error('System hardware insufficient. Exiting.');
    process.exit(1);
  }

  // 2. Setup standard docker instances
  const manager = new DockerManager({
    workDir: './local-test-network',
    projectName: 'hiero-bridge',
    grpcPort: 50211,
    restPort: 5551,
  }, logger);

  logger.info('Generating docker-compose...');
  await manager.generateCompose();

  // logger.info('Spinning up docker containers (uncomment to actually attempt docker run)...');
  // await manager.up();
  
  // const health = await manager.health();
  // logger.info('System health:', health);

  // await manager.down();
  // await manager.cleanCompose();
}

main().catch(console.error);
