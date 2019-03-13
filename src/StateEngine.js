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
    this.blocks = {}; // key: height, value: block hash
    // TODO: replace this with an AccountTree
    this.accountsBalance = {};
    this.accountsBalance[Constants.DEFAULT_TOKEN] = {};
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
    // Process stored blocks after consensus has been reached
    // TODO: we shouldn't need two passes to do this?
    // 1. Sort the stored blocks by height.
    const keys = await this._blockStore.keys();
    for (const key of keys) {
      const block = await this._blockStore.get(key);
      this.blocks[block.height] = block;
    }
    const heights = Object.keys(this.blocks);
    heights.sort();
    // 2. Now process the blocks in the right order
    for (const height of heights) {
      const block = this.blocks[height];
      await this.processBlock(block);
    }
    // 3. Process new blocks inserted by head change event in the indexer last
    for (const key of this._pending) {
      const block = await this._blockStore.get(key);
      await this.processBlock(block);
    }
    // 4. Done!!
    this.state = Constants.STATE_ENGINE_READY;
    Log.i(TAG, `State engine ${this.state} with ` +
        `${Object.keys(this.blocks).length} blocks`);
  }

  /**
   * Pushes a block to be processed by the state engine when head changes.
   * @param {Hash} key The hash of a block to be processed.
   * Must already by stored by the block store.
   */
  async push(key) {
    if (this.state === Constants.STATE_ENGINE_INITIALIZED) {
      // wait in queue to be processed
      this._pending.push(key);
    } else if (this.state === Constants.STATE_ENGINE_READY) {
      // immediately process the block
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
    await this._parseBlock(block);
  }

  /**
   * Parses a block and read relevant transaction metadata from it.
   * @param {Block} block The block to parse
   */
  async _parseBlock(block) {
    const parsed = [];
    const txs = block.body.transactions;
    if (txs.length === 0) { // if no transaction returns empty list
      return parsed;
    }
    // otherwise process each transaction
    // first, we fetch the function to handle an opcode
    const txHandlers = {};
    txHandlers[Constants.OPCODE_BURN] = this._parseBurn.bind(this);
    txHandlers[Constants.OPCODE_ASSET_ISSUE] = this._parseAssetIssue.bind(this);
    for (let i=0; i < txs.length; i++) {
      const tx = txs[i];
      const opCode = await this._getOpCode(tx);
      if (opCode !== null) {
        const txHandler = txHandlers[opCode];
        await txHandler(tx);
      }
    }
  }

  /**
 * Gets the opCode embedded in transaction data, if any
 * @param {ExtendedTransaction} tx The transaction to process
 * @return {String} The embedded opCode, if any
 */
  async _getOpCode(tx) {
    if (tx._format !== Nimiq.Transaction.Format.EXTENDED) {
      return null;
    }
    const asciiData = Nimiq.BufferUtils.toAscii(tx.data);
    for (let i = 0; i < Constants.ALL_OPCODES.length; i++) {
      const opCode = Constants.ALL_OPCODES[i];
      if (asciiData.startsWith(opCode)) {
        return opCode;
      }
    }
    return null;
  }

  /**
   * Parses a NIM burn event from the transaction.
   * @param {ExtendedTransaction} tx A Nimiq extended transaction
   * @return {*} The parsed event
   */
  async _parseBurn(tx) {
    const senderAddr = tx.sender.toUserFriendlyAddress();
    const recipientAddr = tx.recipient.toUserFriendlyAddress();
    const sender = await this._trimWhitespaces(senderAddr);
    const recipient = await this._trimWhitespaces(recipientAddr);
    const burnAddress = await this._trimWhitespaces(
        Constants.MECHA_RICHY_BURN_ADDRESS);
    // validate that NIM has been sent to the burn address
    if (recipient !== burnAddress) {
      return null;
    }
    // adds the burn token to the account
    const dict = this.accountsBalance[Constants.DEFAULT_TOKEN];
    const value = tx.value;
    dict[sender] = (dict[sender] || 0) + value;
    Log.i(TAG, `${Constants.OPCODE_BURN}: ${sender} ${dict[sender]}`);
  }

  /**
   * Parses a token transfer event from the transaction.
   * @param {ExtendedTransaction} tx A Nimiq extended transaction
   * @return {*} The parsed event
   */
  async _parseAssetIssue(tx) {
    // TODO: implement this
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
