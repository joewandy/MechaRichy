const argv = require('minimist')(process.argv.slice(2));
const Nimiq = require('@nimiq/core');
const JDB = require('@nimiq/jungle-db');
const Constants = require('./constants.js');
const StateEngine = require('./StateEngine.js');
const Log = Nimiq.Log;
Log.instance.level = 'info';

const $ = {};
const db = new JDB.JungleDB(Constants.JDB_NAME, Constants.DB_VERSION, {
    maxDbSize: Constants.INITIAL_DB_SIZE,
    autoResize: true,
    useWritemap: Nimiq.PlatformUtils.isNodeJs() && Nimiq.PlatformUtils.isWindows(),
    minResize: Constants.MIN_RESIZE
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
        Log.i(Constants.TAG, 'Consensus lost');
    });

    $.blockchain.on('head-changed', handleHeadChanged);

    $.network.on('peer-joined', (peer) => {
        Log.i(Constants.TAG, `Connected to ${peer.peerAddress.toString()}`);
    });
    $.network.on('peer-left', (peer) => {
        Log.i(Constants.TAG, `Disconnected from ${peer.peerAddress.toString()}`);
    });

    if (argv.hasOwnProperty('test')) {
        Log.i(Constants.TAG, 'Connecting to Nimiq test network');
    } else {
        Log.i(Constants.TAG, 'Connecting to Nimiq main network');
    }
    $.network.connect();

})().catch(e => {
    console.error(e);
    db.close();
    process.exit(1);
});

async function handleConsensus() {
    Log.i(Constants.TAG, 'Consensus established');
    Log.i(Constants.TAG, `Current state: height=${$.blockchain.height}, totalWork=${$.blockchain.totalWork}, headHash=${$.blockchain.headHash}`);
    const maxHeight = $.blockchain.height;
    const chainStore = $.blockchain._store;
    let block = Nimiq.GenesisConfig.GENESIS_BLOCK;
    let height = block.height;

    // TODO: deal with consensus lost and connected again.
    // below line will throw Error: Cannot create ObjectStore while connected
    const blockStore = db.createObjectStore(Constants.JDB_BLOCK_STORE, {
        codec: new BlockStoreCodec(),
        enableLruCache: Constants.BLOCKS_CACHING_ENABLED,
        lruCacheSize: Constants.BLOCKS_CACHE_SIZE,
        rawLruCacheSize: Constants.BLOCKS_RAW_CACHE_SIZE
    });
    await db.connect();
    $.stateEngine = new StateEngine(db, blockStore);
    $.blockStore = blockStore;

    // push all blocks of interest to the database
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
                Log.i(Constants.TAG, `Block ${height}, head ${maxHeight} already stored.`);    
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

async function handleHeadChanged(head) {
    if ($.consensus.established) {
        Log.i(Constants.TAG, `Now at block: ${head.height}`);
        const valid = await isValidBlock(head);
        if (valid) {
            Log.i(Constants.TAG, `Pushing block ${head.height} to StateEngine.`);
            await storeBlock($.blockStore, head);
            const key = block.hash().toBase64();
            $.stateEngine.push(key);    
        }
    }
}

async function isValidBlock(block) {
    let valid = false;
    let txs = block.body.transactions;
    if (txs.length) {
        for (let i=0; i < txs.length; i++) {
            const tx  = txs[i];
            if (tx._format === Nimiq.Transaction.Format.EXTENDED) {
                valid = true;
                break;
            }
        }
    }
    return valid;
}

async function storeBlock(blockStore, block) {
    const jtx = blockStore.transaction();
    const key = block.hash().toBase64();
    await jtx.put(key, block);
    await jtx.commit();
    Log.i(Constants.TAG, `Block ${block.height} stored.`);    
}

class BlockStoreCodec {
    encode(obj) {
        return obj.serialize();
    }

    decode(obj, key) {
        const block = Nimiq.Block.unserialize(new Nimiq.SerialBuffer(obj));
        block.header._hash = Nimiq.Hash.fromBase64(key);
        return block;
    }

    get valueEncoding() {
        return JDB.JungleDB.BINARY_ENCODING;
    }
}