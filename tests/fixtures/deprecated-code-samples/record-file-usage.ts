/**
 * Fixture file containing deprecated record file and getRecord() usage.
 * Used by detector.test.ts to verify scanning accuracy.
 *
 * DO NOT FIX THESE — they are intentionally deprecated for testing.
 */

// Deprecated: HIERO-030 — Record File parsing (v5 format)
import { RecordFile } from './legacy-parser';

function parseRecordStream(path: string) {
  // Uses the old recordFile format
  const recordFile = RecordFile.fromPath(path);
  return recordFile.getTransactions();
}

function processLegacyRecords(directory: string) {
  const files = listFiles(directory, '*.rcd');
  for (const file of files) {
    const parsed = parseRecordFile(file);
    console.log(`Processed ${file}: ${parsed.length} records`);
  }
}

// Deprecated: HIERO-031 — getRecord() on TransactionResponse
async function submitAndGetRecord(client: any, transaction: any) {
  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);

  // This is the deprecated pattern
  const record = await response.getRecord(client);
  return { receipt, record };
}

// Deprecated: HIERO-010 — TokenInfoQuery
async function checkToken(client: any, tokenId: string) {
  const info = await new TokenInfoQuery()
    .setTokenId(tokenId)
    .execute(client);
  return info;
}

// Clean code (should NOT be flagged by HIERO-030/031)
function cleanUtility() {
  const record = { id: 1, name: 'test' };
  const getRecord = () => record;
  return getRecord();
}

// Helper stubs for the fixture
declare function listFiles(dir: string, pattern: string): string[];
declare function parseRecordFile(file: string): unknown[];
