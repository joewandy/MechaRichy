const argv = require('minimist')(process.argv.slice(2));
const Nimiq = require('@nimiq/core');
const JDB = require('@nimiq/jungle-db');
const Constants = require('./constants.js');
const StateEngine = require('./StateEngine.js');
const Log = Nimiq.Log;
Log.instance.level = 'info';
const TAG = 'MechaRichy';

const $ = {};
const db = new JDB.JungleDB(Constants.JDB_NAME, Constants.DB_VERSION, {
  maxDbSize: Constants.INITIAL_DB_SIZE,
  autoResize: true,
  useWritemap: Nimiq.PlatformUtils.isNodeJs() &&
    Nimiq.PlatformUtils.isWindows(),
  minResize: Constants.MIN_RESIZE,
});
db.createObjectStore(Constants.JDB_TX_STORE);
(async () => {
  if (argv.hasOwnProperty('test')) {
    Nimiq.GenesisConfig.test();
  } else {
    Nimiq.GenesisConfig.main();
  }

  const networkConfig = new Nimiq.DumbNetworkConfig();
  $.consensus = await Nimiq.Consensus.full(networkConfig);
  $.blockchain = $.consensus.blockchain;
  $.network = $.consensus.network;

  $.consensus.on('established', handleConsensus);
  $.consensus.on('lost', () => {
    Log.i(TAG, 'Consensus lost');
  });

  $.blockchain.on('head-changed', handleHeadChanged);

  $.network.on('peer-joined', (peer) => {
    Log.i(TAG, `Connected to ${peer.peerAddress.toString()}`);
  });
  $.network.on('peer-left', (peer) => {
    Log.i(TAG, `Disconnected from ${peer.peerAddress.toString()}`);
  });

  if (argv.hasOwnProperty('test')) {
    Log.i(TAG, 'Connecting to Nimiq test network');
  } else {
    Log.i(TAG, 'Connecting to Nimiq main network');
  }
  $.network.connect();
})().catch((e) => {
  console.error(e);
  db.close();
  process.exit(1);
});

/**
 * Handles consensus event
 */
async function handleConsensus() {
  Log.i(TAG, 'Consensus established');
  Log.i(TAG, `Current state: height=${$.blockchain.height}, ` +
    `headHash=${$.blockchain.headHash}`);
  const chainStore = $.blockchain._store;

  // TODO: deal with consensus lost and connected again.
  // below line will throw Error: Cannot create ObjectStore while connected
  const blockStore = db.createObjectStore(Constants.JDB_BLOCK_STORE, {
    codec: new BlockStoreCodec(),
    enableLruCache: Constants.BLOCKS_CACHING_ENABLED,
    lruCacheSize: Constants.BLOCKS_CACHE_SIZE,
    rawLruCacheSize: Constants.BLOCKS_RAW_CACHE_SIZE,
  });
  await db.connect();
  $.stateEngine = new StateEngine(db, blockStore);
  $.blockStore = blockStore;

  // push all blocks of interest to the database
  let block = null;
  let height = Constants.INDEX_START_BLOCK;
  const maxHeight = $.blockchain.height;
  for (;;) {
    block = await chainStore.getBlockAt(height, true);
    if (block === null) {
      break;
    }

    // if we find interesting an interesting block, store it
    const valid = await isValidBlock(block);
    if (valid) {
      const key = block.hash().toBase64();
      const temp = await blockStore.get(key);
      if (temp === undefined) {
        await storeBlock(blockStore, block);
      } else {
        Log.i(TAG, `Block ${height} already stored`);
      }
    }

    // move on to the next block until done
    height = block.height + 1;
    if (height > maxHeight) {
      break;
    }
  }

  // blocks ready, initalise state engine
  $.stateEngine.parseDb();
}

/**
 * Handles head change event
 * @param {Block} head The current head block
 */
async function handleHeadChanged(head) {
  if ($.consensus.established) {
    Log.i(TAG, `Now at block: ${head.height}`);
    const valid = await isValidBlock(head);
    if (valid) {
      Log.i(TAG, `Pushing block ${head.height} to StateEngine.`);
      await storeBlock($.blockStore, head);
      const key = head.hash().toBase64();
      $.stateEngine.push(key);
    }
  }
}

/**
 * Checks if the current block is a block we want to process
 * @param {Block} block A Nimiq block
 */
async function isValidBlock(block) {
  let valid = false;
  const txs = block.body.transactions;
  if (txs.length) {
    for (let i=0; i < txs.length; i++) {
      const tx = txs[i];
      if (tx._format === Nimiq.Transaction.Format.EXTENDED) {
        const asciiData = Nimiq.BufferUtils.toAscii(tx.data);
        if (asciiData.startsWith(Constants.OPCODE_PREFIX)) {
          valid = true;
          break;
        }
      }
    }
  }
  return valid;
}

/**
 * Stores a block into the blockstore
 * @param {BlockStore} blockStore A JungleDB blockstore
 * @param {Block} block A Nimiq block
 */
async function storeBlock(blockStore, block) {
  const jtx = blockStore.transaction();
  const key = block.hash().toBase64();
  await jtx.put(key, block);
  await jtx.commit();
  Log.i(TAG, `Block ${block.height} stored`);
}

/**
 * A codec to serialise and deserialise block when storing in JungleDB
 */
class BlockStoreCodec {
  /**
     * Encodes a block
     * @param {Block} obj a Nimiq block
     * @return {*} A serialised block
     */
  encode(obj) {
    return obj.serialize();
  }

  /**
   * Decodes a block
   * @param {*} obj The serialised buffer representation of a block
   * @param {*} key The hash of a block
   * @return {Block} a Nimiq block
   */
  decode(obj, key) {
    const block = Nimiq.Block.unserialize(new Nimiq.SerialBuffer(obj));
    block.header._hash = Nimiq.Hash.fromBase64(key);
    return block;
  }

  /**
   * Specifies how to encode the value
   */
  get valueEncoding() {
    return JDB.JungleDB.BINARY_ENCODING;
  }
}
