import { describe, it, expect } from 'vitest';
import {
  BlockHeaderSchema,
  EventTransactionSchema,
  StateChangeSchema,
  StateChangeTypeSchema,
  BlockProofSchema,
  StateProofSchema,
  BlockItemSchema,
  BlockSchema,
  BlockStreamEventSchema,
  AccountBalanceSchema,
  TransactionTypeSchema,
  ResponseCodeSchema,
  TransactionReceiptSchema,
  ContractFunctionResultSchema,
} from '../../../src/types/block.js';

// ---------------------------------------------------------------------------
// Shared valid data factories
// ---------------------------------------------------------------------------

function validHeader() {
  return {
    number: 0,
    hash: 'abc123',
    previousHash: '',
    timestamp: '2026-01-15T00:00:00.000Z',
    itemCount: 2,
    hashAlgorithm: 'SHA_384' as const,
  };
}

function validTransaction() {
  return {
    transactionId: '0.0.1001@1709000000.000000000',
    type: 'CryptoTransfer' as const,
    payerAccountId: '0.0.1001',
    receipt: { status: 'SUCCESS' as const },
    fee: 100000,
    consensusTimestamp: '2026-01-15T00:00:00.000Z',
    validStartTimestamp: '2026-01-15T00:00:00.000Z',
    validDurationSeconds: 120,
    nodeAccountId: '0.0.3',
    transfers: [
      { accountId: '0.0.1001', amount: -500 },
      { accountId: '0.0.1002', amount: 500 },
    ],
    tokenTransfers: [],
  };
}

function validStateChange() {
  return {
    entityId: '0.0.1001',
    changeType: 'BALANCE' as const,
    previousValue: '1000',
    newValue: '500',
    transactionId: '0.0.1001@1709000000.000000000',
    consensusTimestamp: '2026-01-15T00:00:00.000Z',
  };
}

function validBlockProof() {
  return {
    blockNumber: 0,
    blockHash: 'abc123',
    signature: 'sig-hex',
    verified: true,
  };
}

function validStateProof() {
  return {
    entityId: '0.0.100',
    stateValue: '10000000000',
    atBlockNumber: 5,
    timestamp: '2026-01-15T00:00:10.000Z',
    merklePath: ['hash1', 'hash2'],
    verified: true,
  };
}

function validAccountBalance() {
  return {
    accountId: '0.0.100',
    balanceTinybars: 10000000000,
    hbars: '100.00',
    tokens: [],
  };
}

// ---------------------------------------------------------------------------
// BlockHeader
// ---------------------------------------------------------------------------

describe('BlockHeaderSchema', () => {
  it('accepts valid block header', () => {
    const result = BlockHeaderSchema.safeParse(validHeader());
    expect(result.success).toBe(true);
  });

  it('rejects negative block number', () => {
    const result = BlockHeaderSchema.safeParse({ ...validHeader(), number: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer block number', () => {
    const result = BlockHeaderSchema.safeParse({ ...validHeader(), number: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing hash', () => {
    const { hash, ...rest } = validHeader();
    const result = BlockHeaderSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid timestamp format', () => {
    const result = BlockHeaderSchema.safeParse({ ...validHeader(), timestamp: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('defaults hashAlgorithm to SHA_384', () => {
    const { hashAlgorithm, ...rest } = validHeader();
    const result = BlockHeaderSchema.parse(rest);
    expect(result.hashAlgorithm).toBe('SHA_384');
  });

  it('accepts optional softwareVersion', () => {
    const result = BlockHeaderSchema.safeParse({ ...validHeader(), softwareVersion: '0.56.0' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.softwareVersion).toBe('0.56.0');
  });
});

// ---------------------------------------------------------------------------
// TransactionType & ResponseCode
// ---------------------------------------------------------------------------

describe('TransactionTypeSchema', () => {
  it('accepts all valid transaction types', () => {
    const types = [
      'CryptoTransfer', 'CryptoCreate', 'ContractCall', 'ContractCreate',
      'TokenMint', 'TokenBurn', 'TokenCreate', 'ConsensusSubmitMessage',
      'FileCreate', 'ScheduleCreate',
    ];
    for (const t of types) {
      expect(TransactionTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects unknown transaction type', () => {
    expect(TransactionTypeSchema.safeParse('FakeTransaction').success).toBe(false);
  });
});

describe('ResponseCodeSchema', () => {
  it('accepts SUCCESS', () => {
    expect(ResponseCodeSchema.safeParse('SUCCESS').success).toBe(true);
  });

  it('accepts all defined response codes', () => {
    const codes = [
      'SUCCESS', 'INVALID_TRANSACTION', 'PAYER_ACCOUNT_NOT_FOUND',
      'INSUFFICIENT_PAYER_BALANCE', 'CONTRACT_REVERT_EXECUTED', 'UNKNOWN',
    ];
    for (const c of codes) {
      expect(ResponseCodeSchema.safeParse(c).success).toBe(true);
    }
  });

  it('rejects unknown response code', () => {
    expect(ResponseCodeSchema.safeParse('FAKE_CODE').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EventTransaction
// ---------------------------------------------------------------------------

describe('EventTransactionSchema', () => {
  it('accepts valid transaction', () => {
    const result = EventTransactionSchema.safeParse(validTransaction());
    expect(result.success).toBe(true);
  });

  it('rejects missing transactionId', () => {
    const { transactionId, ...rest } = validTransaction();
    expect(EventTransactionSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid transaction type', () => {
    const result = EventTransactionSchema.safeParse({ ...validTransaction(), type: 'InvalidType' });
    expect(result.success).toBe(false);
  });

  it('defaults transfers to empty array', () => {
    const { transfers, tokenTransfers, ...rest } = validTransaction();
    const result = EventTransactionSchema.parse({ ...rest, receipt: { status: 'SUCCESS' } });
    expect(result.transfers).toEqual([]);
    expect(result.tokenTransfers).toEqual([]);
  });

  it('accepts optional contractResult', () => {
    const result = EventTransactionSchema.safeParse({
      ...validTransaction(),
      type: 'ContractCall',
      contractResult: {
        contractId: '0.0.7000',
        result: '0x01',
        gasUsed: 25000,
        gas: 80000,
        amount: 0,
        logs: [],
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StateChange
// ---------------------------------------------------------------------------

describe('StateChangeSchema', () => {
  it('accepts valid state change', () => {
    expect(StateChangeSchema.safeParse(validStateChange()).success).toBe(true);
  });

  it('rejects missing entityId', () => {
    const { entityId, ...rest } = validStateChange();
    expect(StateChangeSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts all defined StateChangeType values', () => {
    const types = ['BALANCE', 'NONCE', 'STORAGE', 'TOKEN_BALANCE', 'NFT_OWNERSHIP'];
    for (const t of types) {
      expect(StateChangeTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects unknown StateChangeType', () => {
    expect(StateChangeTypeSchema.safeParse('INVALID_TYPE').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BlockProof
// ---------------------------------------------------------------------------

describe('BlockProofSchema', () => {
  it('accepts valid block proof', () => {
    expect(BlockProofSchema.safeParse(validBlockProof()).success).toBe(true);
  });

  it('rejects missing signature', () => {
    const { signature, ...rest } = validBlockProof();
    expect(BlockProofSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts optional merkleRoot', () => {
    const result = BlockProofSchema.safeParse({ ...validBlockProof(), merkleRoot: 'root-hash' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StateProof
// ---------------------------------------------------------------------------

describe('StateProofSchema', () => {
  it('accepts valid state proof', () => {
    expect(StateProofSchema.safeParse(validStateProof()).success).toBe(true);
  });

  it('rejects missing entityId', () => {
    const { entityId, ...rest } = validStateProof();
    expect(StateProofSchema.safeParse(rest).success).toBe(false);
  });

  it('defaults merklePath to empty array', () => {
    const { merklePath, ...rest } = validStateProof();
    const result = StateProofSchema.parse(rest);
    expect(result.merklePath).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// BlockItem (discriminated union)
// ---------------------------------------------------------------------------

describe('BlockItemSchema', () => {
  it('resolves transaction variant', () => {
    const item = { kind: 'transaction', data: validTransaction() };
    const result = BlockItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe('transaction');
  });

  it('resolves stateChange variant', () => {
    const item = { kind: 'stateChange', data: validStateChange() };
    const result = BlockItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe('stateChange');
  });

  it('resolves systemEvent variant', () => {
    const item = {
      kind: 'systemEvent',
      data: {
        eventType: 'EPOCH_CHANGE',
        timestamp: '2026-01-15T00:00:00.000Z',
        description: 'New epoch started',
      },
    };
    const result = BlockItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe('systemEvent');
  });

  it('rejects unknown kind', () => {
    const item = { kind: 'unknown', data: {} };
    expect(BlockItemSchema.safeParse(item).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

describe('BlockSchema', () => {
  it('accepts valid block with items and proof', () => {
    const block = {
      header: validHeader(),
      items: [
        { kind: 'transaction', data: validTransaction() },
        { kind: 'stateChange', data: validStateChange() },
      ],
      proof: validBlockProof(),
      gasUsed: 0,
      successfulTransactions: 1,
      failedTransactions: 0,
    };
    expect(BlockSchema.safeParse(block).success).toBe(true);
  });

  it('accepts block without proof', () => {
    const block = {
      header: validHeader(),
      items: [],
    };
    const result = BlockSchema.safeParse(block);
    expect(result.success).toBe(true);
  });

  it('defaults gasUsed / successfulTransactions / failedTransactions to 0', () => {
    const result = BlockSchema.parse({
      header: validHeader(),
      items: [],
    });
    expect(result.gasUsed).toBe(0);
    expect(result.successfulTransactions).toBe(0);
    expect(result.failedTransactions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BlockStreamEvent (discriminated union)
// ---------------------------------------------------------------------------

describe('BlockStreamEventSchema', () => {
  it('resolves BLOCK_START', () => {
    const event = { type: 'BLOCK_START', header: validHeader() };
    const result = BlockStreamEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe('BLOCK_START');
  });

  it('resolves BLOCK_ITEM', () => {
    const event = {
      type: 'BLOCK_ITEM',
      item: { kind: 'transaction', data: validTransaction() },
      blockNumber: 0,
    };
    const result = BlockStreamEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('resolves BLOCK_END', () => {
    const event = {
      type: 'BLOCK_END',
      blockNumber: 0,
      summary: { itemCount: 2, gasUsed: 0, successCount: 1, failCount: 0 },
    };
    const result = BlockStreamEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('resolves STREAM_ERROR', () => {
    const event = { type: 'STREAM_ERROR', error: 'Connection lost', recoverable: true };
    expect(BlockStreamEventSchema.safeParse(event).success).toBe(true);
  });

  it('resolves STREAM_HEARTBEAT', () => {
    const event = {
      type: 'STREAM_HEARTBEAT',
      timestamp: '2026-01-15T00:00:00.000Z',
      latestBlockNumber: 42,
    };
    expect(BlockStreamEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects unknown event type', () => {
    const event = { type: 'FAKE_EVENT' };
    expect(BlockStreamEventSchema.safeParse(event).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AccountBalance
// ---------------------------------------------------------------------------

describe('AccountBalanceSchema', () => {
  it('accepts valid account balance', () => {
    expect(AccountBalanceSchema.safeParse(validAccountBalance()).success).toBe(true);
  });

  it('rejects negative balance', () => {
    const result = AccountBalanceSchema.safeParse({ ...validAccountBalance(), balanceTinybars: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts balance with tokens', () => {
    const result = AccountBalanceSchema.safeParse({
      ...validAccountBalance(),
      tokens: [{ tokenId: '0.0.5000', balance: 1000, decimals: 8 }],
    });
    expect(result.success).toBe(true);
  });

  it('defaults tokens to empty array', () => {
    const { tokens, ...rest } = validAccountBalance();
    const result = AccountBalanceSchema.parse(rest);
    expect(result.tokens).toEqual([]);
  });

  it('accepts optional atBlockNumber', () => {
    const result = AccountBalanceSchema.safeParse({ ...validAccountBalance(), atBlockNumber: 10 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.atBlockNumber).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// TransactionReceipt
// ---------------------------------------------------------------------------

describe('TransactionReceiptSchema', () => {
  it('accepts minimal receipt with status only', () => {
    expect(TransactionReceiptSchema.safeParse({ status: 'SUCCESS' }).success).toBe(true);
  });

  it('accepts receipt with created accountId', () => {
    const result = TransactionReceiptSchema.safeParse({ status: 'SUCCESS', accountId: '0.0.2000' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status code', () => {
    expect(TransactionReceiptSchema.safeParse({ status: 'FAKE_STATUS' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ContractFunctionResult
// ---------------------------------------------------------------------------

describe('ContractFunctionResultSchema', () => {
  it('accepts valid contract result', () => {
    const result = ContractFunctionResultSchema.safeParse({
      contractId: '0.0.7000',
      result: '0x01',
      gasUsed: 25000,
      gas: 80000,
      amount: 0,
      logs: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing contractId', () => {
    const result = ContractFunctionResultSchema.safeParse({
      result: '0x01',
      gasUsed: 25000,
      gas: 80000,
    });
    expect(result.success).toBe(false);
  });

  it('accepts result with error message', () => {
    const result = ContractFunctionResultSchema.safeParse({
      contractId: '0.0.7000',
      result: '0x08c379a0',
      errorMessage: 'Revert',
      gasUsed: 50000,
      gas: 100000,
      amount: 0,
      logs: [],
    });
    expect(result.success).toBe(true);
  });
});
