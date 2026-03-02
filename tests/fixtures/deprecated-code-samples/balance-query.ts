/**
 * Fixture file containing deprecated Hedera API usage.
 * Used by detector.test.ts to verify scanning accuracy.
 *
 * DO NOT FIX THESE — they are intentionally deprecated for testing.
 */

import { Client } from '@hashgraph/sdk';

// Deprecated: HIERO-001 — AccountBalanceQuery
async function getBalance(client: Client, accountId: string) {
  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  return balance;
}

// Deprecated: HIERO-002 — AccountInfoQuery
async function getAccountInfo(client: Client, accountId: string) {
  const info = await new AccountInfoQuery()
    .setAccountId(accountId)
    .execute(client);
  return info;
}

// Deprecated: HIERO-003 — AccountRecordsQuery
async function getRecords(client: Client, accountId: string) {
  const records = await new AccountRecordsQuery()
    .setAccountId(accountId)
    .execute(client);
  return records;
}

// Deprecated: HIERO-005 — ContractCallQuery
async function callContract(client: Client, contractId: string) {
  const result = await new ContractCallQuery()
    .setContractId(contractId)
    .setGas(100000)
    .execute(client);
  return result;
}

// Deprecated: HIERO-041 — Free query quota (setQueryPayment(0))
async function freeQuery(client: Client) {
  const balance = await new AccountBalanceQuery()
    .setAccountId('0.0.100')
    .setQueryPayment(0)
    .execute(client);
  return balance;
}

// Clean code (should NOT be flagged)
function cleanFunction() {
  const data = { name: 'test', value: 42 };
  console.log('This is clean code with no deprecated APIs');
  return data;
}
