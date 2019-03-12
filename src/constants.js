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
exports.COMMAND_BURN = 'BURN';
exports.DEFAULT_TOKEN = 'MECHA';
