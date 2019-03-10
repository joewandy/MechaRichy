const Nimiq = require('@nimiq/core');
const Constants = require('./constants.js');

const Log = Nimiq.Log;
Log.instance.level = 'info';

class StateEngine {
    constructor(jdb, blockStore) {
        this.blocks = {};
        this.accountsBalance = {
            'MCRC': {}
        };
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

        const parsed = await this._parseBlock(block);
        if (parsed.length > 0) {
            for (let i = 0; i < parsed.length; i++) {
                const parsedCommand = parsed[i];
                if (parsedCommand.type === 'BURN') {
                    const dict = this.accountsBalance['MCRC'];
                    const key = parsedCommand.sender;
                    const value = parsedCommand.value;
                    dict[key] = (dict[key] || 0) + value;
                }    
            }
        }
    }

    async _parseBlock(block) {
        let parsed = [];
        let txs = block.body.transactions;
        if (txs.length === 0) {
            return parsed;
        }
        for (let i=0; i < txs.length; i++) {
            const tx  = txs[i];
            if (tx._format === Nimiq.Transaction.Format.EXTENDED) {
                const asciiData = Nimiq.BufferUtils.toAscii(tx.data);
                if (asciiData.startsWith('MCRC_')) {
                    let results = await this._parseBurn(tx);
                    parsed.push(results);
                }
            }
        }
        return parsed;
    }

    async _parseBurn(tx) {
        const asciiData = Nimiq.BufferUtils.toAscii(tx.data);
        if (asciiData === 'MCRC_01') {
            const sender = await this._trim_whitespaces(tx.sender.toUserFriendlyAddress());
            const recipient = await this._trim_whitespaces(tx.recipient.toUserFriendlyAddress());
            const burnAddress = await this._trim_whitespaces(Constants.MECHA_RICHY_BURN_ADDRESS);
            if (recipient !== burnAddress) {
                return null;
            }
            // const value = Nimiq.Policy.lunasToCoins(tx.value);    
            const value = tx.value;
            const results = {
                type: 'BURN',
                sender: sender,
                recipient: recipient,
                value: value
            }
            return results;
        }
        return null;
    }

    async _trim_whitespaces(myString) {
        return myString.replace(/\s/g, '');
    }
    
}

module.exports = StateEngine;