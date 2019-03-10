const Nimiq = require('@nimiq/core');
const Constants = require('./constants.js');

const Log = Nimiq.Log;
Log.instance.level = 'info';

class StateEngine {
    constructor(jdb, blockStore) {
        this.blocks = {};
        this.state = Constants.STATE_ENGINE_INITIALIZED;
        this._jdb = jdb;
        this._blockStore = blockStore;
        this._pending = [];
        Log.i(Constants.TAG, `State engine ${this.state}`);
    }

    async parseDb() {
        // process db block
        let keys = await this._blockStore.keys();
        for (const key of keys) {
            const block = await this._blockStore.get(key);
            await this.processBlock(block);
        }
        // process new blocks inserted by head change event in the indexer
        for (const key of this._pending) {
            const block = await this._blockStore.get(key);
            await this.processBlock(block);
        }
        // done!!
        this.state = Constants.STATE_ENGINE_READY;
        Log.i(Constants.TAG, `State engine ${this.state} with ${Object.keys(this.blocks).length} blocks`);
    }

    async push(key) {
        if (this.state === Constants.STATE_ENGINE_INITIALIZED) {
            this._pending.push(key);
        } else if (this.state === Constants.STATE_ENGINE_READY) {
            const block = await this._blockStore.get(key);
            await this.processBlock(block);
        }
    }

    async processBlock(block) {
        Log.i(Constants.TAG, `Processing block ${block.height}`);
        const height = block.height;
        this.blocks[height] = block;
    }

}

module.exports = StateEngine;