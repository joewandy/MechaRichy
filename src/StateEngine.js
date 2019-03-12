const Nimiq = require('@nimiq/core');
const Constants = require('./constants.js');

const Log = Nimiq.Log;
Log.instance.level = 'info';
const TAG = 'StateEngine';

/**
 * State engine
 */
class StateEngine {
  /**
     * Initializes the state engine
     * @param {JungleDB} jdb JungleDB instance
     * @param {Objectstore} blockStore a block store instance
     */
  constructor(jdb, blockStore) {
    this.blocks = {};
    this.accountsBalance = {
      'MECHA': {},
    };
    this.state = Constants.STATE_ENGINE_INITIALIZED;
    this._jdb = jdb;
    this._blockStore = blockStore;
    this._pending = [];
    Log.i(TAG, `State engine ${this.state}`);
  }

  /**
   * Parses the indexed blockchain and update states.
   */
  async parseDb() {
    // process db block
    const keys = await this._blockStore.keys();
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
    Log.i(TAG, `State engine ${this.state} with ` +
        `${Object.keys(this.blocks).length} blocks`);
  }

  /**
   * Pushes a block to be processed by the state engine
   * @param {Hash} key The hash of a block to be processed.
   * Must already by stored by the block store.
   */
  async push(key) {
    if (this.state === Constants.STATE_ENGINE_INITIALIZED) {
      this._pending.push(key);
    } else if (this.state === Constants.STATE_ENGINE_READY) {
      const block = await this._blockStore.get(key);
      await this.processBlock(block);
    }
  }

  /**
   * Processes a block
   * @param {Block} block The block to process
   */
  async processBlock(block) {
    Log.i(TAG, `Processing block ${block.height}`);
    const height = block.height;
    this.blocks[height] = block;

    const parsed = await this._parseBlock(block);
    if (parsed.length > 0) {
      for (let i = 0; i < parsed.length; i++) {
        const parsedCommand = parsed[i];
        if (parsedCommand.type === 'BURN') {
          const dict = this.accountsBalance['MECHA'];
          const key = parsedCommand.sender;
          const value = parsedCommand.value;
          dict[key] = (dict[key] || 0) + value;
        }
      }
    }
  }

  /**
   * Parses a block and read relevant transaction metadata from it.
   * @param {Block} block The block to parse
   */
  async _parseBlock(block) {
    const parsed = [];
    const txs = block.body.transactions;
    if (txs.length === 0) {
      return parsed;
    }
    for (let i=0; i < txs.length; i++) {
      const tx = txs[i];
      if (tx._format === Nimiq.Transaction.Format.EXTENDED) {
        const asciiData = Nimiq.BufferUtils.toAscii(tx.data);
        if (asciiData.startsWith('MCRC_')) {
          const results = await this._parseBurn(tx);
          parsed.push(results);
        }
      }
    }
    return parsed;
  }

  /**
   * Parses a NIM burn event from the transaction.
   * @param {ExtendedTransaction} tx A Nimiq extended transaction
   */
  async _parseBurn(tx) {
    const asciiData = Nimiq.BufferUtils.toAscii(tx.data);
    if (asciiData === 'MCRC_01') {
      const sender = await this._trimWhitespaces(
          tx.sender.toUserFriendlyAddress());
      const recipient = await this._trimWhitespaces(
          tx.recipient.toUserFriendlyAddress());
      const burnAddress = await this._trimWhitespaces(
          Constants.MECHA_RICHY_BURN_ADDRESS);
      if (recipient !== burnAddress) {
        return null;
      }
      // const value = Nimiq.Policy.lunasToCoins(tx.value);
      const value = tx.value;
      const results = {
        type: 'BURN',
        sender: sender,
        recipient: recipient,
        value: value,
      };
      return results;
    }
    return null;
  }

  /**
   * Removes all whitespaces in a string
   * @param {String} myString The string to process
   */
  async _trimWhitespaces(myString) {
    return myString.replace(/\s/g, '');
  }
}

module.exports = StateEngine;
