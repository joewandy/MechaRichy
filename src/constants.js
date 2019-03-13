// JungleDB constants
exports.JDB_NAME = 'mecha-richy-data';
exports.JDB_TX_STORE = 'Transaction';
exports.JDB_BLOCK_STORE = 'Block';
exports.BLOCKS_CACHING_ENABLED = true;
exports.BLOCKS_CACHE_SIZE = 0;
exports.BLOCKS_RAW_CACHE_SIZE = 500;
exports.DB_VERSION = 1;
exports.INITIAL_DB_SIZE = 1024*1024*500; // 500 MB initially
exports.MIN_RESIZE = 1 << 30; // 1 GB

// MechaRichy constants
exports.INDEX_START_BLOCK = 472500;
exports.MECHA_RICHY_BURN_ADDRESS = 'NQ05 MECH AR0C HY00 0000 ' +
    '0000 0000 0000 0000';

// StateEngine constants
exports.STATE_ENGINE_INITIALIZED = 'INITIALIZED';
exports.STATE_ENGINE_READY = 'READY';
exports.DEFAULT_TOKEN = 'MECHA';

// Inspired by https://counterparty.io/docs/protocol_specification/
exports.OPCODE_BURN = 'MECHA_01';
exports.OPCODE_ASSET_ISSUE = 'MECHA_02'; // create asset
exports.OPCODE_ASSET_TRANSFER = 'MECHA_03'; // move asset
exports.OPCODE_ASSET_DESTROY = 'MECHA_04'; // destroy asset

// dex functionalities
exports.OPCODE_ASSET_ORDER = 'MECHA_05';
exports.OPCODE_ASSET_CANCEL_ORDER = 'MECHA_06';
exports.OPCODE_ASSET_LOCK = 'MECHA_07';

// misc functionalities
exports.OPCODE_MEMO = 'MECHA_08';
exports.OPCODE_BROADCAST = 'MECHA_09';
exports.OPCODE_BET = 'MECHA_10';
exports.OPCODE_PAY_DIVIDEND = 'MECHA_11';

exports.ALL_OPCODES = [
  exports.OPCODE_BURN,
  exports.OPCODE_ASSET_ISSUE,
  exports.OPCODE_ASSET_TRANSFER,
  exports.OPCODE_ASSET_DESTROY,
  exports.OPCODE_ASSET_ORDER,
  exports.OPCODE_ASSET_CANCEL_ORDER,
  exports.OPCODE_ASSET_LOCK,
  exports.OPCODE_MEMO,
  exports.OPCODE_BROADCAST,
  exports.OPCODE_BET,
  exports.OPCODE_PAY_DIVIDEND,
];
