const argv = require('minimist')(process.argv.slice(2));
const Nimiq = require('@nimiq/core');
const JDB = require('@nimiq/jungle-db');
const Constants = require('../../src/constants.js');
const inquirer = require('inquirer');
const Log = Nimiq.Log;
Log.instance.level = 'info';
const TAG = 'MechaWallet';

const $ = {};
const db = new JDB.JungleDB(Constants.JDB_NAME, Constants.DB_VERSION, {
  maxDbSize: Constants.INITIAL_DB_SIZE,
  autoResize: true,
  useWritemap: Nimiq.PlatformUtils.isNodeJs() &&
    Nimiq.PlatformUtils.isWindows(),
  minResize: Constants.MIN_RESIZE,
});
db.createObjectStore(Constants.JDB_WALLET_STORE);
(async () => {
  if (argv.hasOwnProperty('test')) {
    Nimiq.GenesisConfig.test();
  } else {
    Nimiq.GenesisConfig.main();
  }

  $.consensus = await Nimiq.Consensus.nano();
  $.blockchain = $.consensus.blockchain;
  $.accounts = $.blockchain.accounts;
  $.mempool = $.consensus.mempool;
  $.network = $.consensus.network;

  $.consensus.on('established', handleConsensus);
  $.consensus.on('lost', () => {
    Log.i(TAG, 'Consensus lost');
  });

  $.blockchain.on('head-changed', handleHeadChanged);

  $.network.on('peer-joined', (peer) => {
    if (!$.consensus.established) {
      Log.i(TAG, `Connected to ${peer.peerAddress.toString()}`);
    }
  });
  $.network.on('peer-left', (peer) => {
    if (!$.consensus.established) {
      Log.i(TAG, `Disconnected from ${peer.peerAddress.toString()}`);
    }    
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
  console.clear();
  Log.i(TAG, 'Consensus established');
  Log.i(TAG, `Current state: height=${$.blockchain.height}, ` +
    `headHash=${$.blockchain.headHash}`);

  await db.connect();
  const wallet = await generateWallet(db);
  const account = await $.consensus.getAccount(wallet.address);
  const balance = account ? Nimiq.Policy.lunasToCoins(account.balance) : 0;
  Log.i(TAG, `Address ${wallet.address.toUserFriendlyAddress()}`);
  Log.i(TAG, `Balance ${balance} NIM`);

  for (;;) {
    const ans = await inquirer
      .prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What do you want to do?',
          choices: [
            {name: '1. Create wallet', value: 1},
            {name: '2. View wallets', value: 2},
            {name: '3. Send NIM', value: 3},
            {name: '4. Burn NIM', value: 4},
            {name: '5. Create token', value: 5},
            {name: '6. Send token', value: 6},
            {name: '7. Quit', value: 7}
          ]
        }
      ]);
      switch(ans.action) {
        case 1:
          Log.i(TAG, `Create wallet`);
          break;
        case 2:
        Log.i(TAG, `View wallets`);
          break;
        case 3:
        Log.i(TAG, `Send NIM`);
          break;
        case 4:
          Log.i(TAG, `Burn NIM`);
          break;
        case 5:
          Log.i(TAG, `Create token`);
          break;
        case 6:
          Log.i(TAG, `Send token`);
          break;
        case 7:
          Log.i(TAG, `Quit. Bye!`);
          db.close();
          process.exit(1);  
        default:
          // code block
      }      
  }

  // const recipient = 'NQ79 RPRB 8ECP 0FCN X1P2 UR7J DKPP GBRX UJKR';
  // const amount = 1;
  // const message = 'hi';
  // const validityStartHeight = $.blockchain.height;
  // const tx = await extendedTransaction(wallet, recipient, amount, message, validityStartHeight);
  // console.log(tx);
}

async function generateWallet() {
  // the newly created wallet is the only one, make it the default
  const walletStore = await new Nimiq.WalletStore();
  const wallet = await walletStore.getDefault();
  if (wallet === undefined) {
    const wallet = Nimiq.Wallet.generate();
    walletStore.setDefault(wallet.address);
  }
  return wallet;
}

async function extendedTransaction(wallet, recipient, amount, message, validityStartHeight) {
  const fee = 1;
  const extraData = Nimiq.BufferUtils.fromAscii(message);
  const transaction = new Nimiq.ExtendedTransaction(
      wallet.address,
      Nimiq.Account.Type.BASIC,
      Nimiq.Address.fromUserFriendlyAddress(recipient),
      Nimiq.Account.Type.BASIC,
      Nimiq.Policy.coinsToSatoshis(amount),
      fee,
      validityStartHeight,
      Nimiq.Transaction.Flag.NONE,
      extraData
  );

  // sign transaction with the key pair of our wallet
  const keyPair = wallet._keyPair;
  const signature = Nimiq.Signature.create(
      keyPair.privateKey,
      keyPair.publicKey,
      transaction.serializeContent()
  );
  const proof = Nimiq.SignatureProof.singleSig(keyPair.publicKey, signature);
  transaction.proof = proof.serialize();
  return transaction;
}

/**
 * Handles head change event
 * @param {Block} head The current head block
 */
async function handleHeadChanged(head) {
  if (!$.consensus.established) {
    if (head.height % 100 == 0) {
      Log.i(TAG, `Now at block: ${head.height}`);
    }
  } else {
    // if (head.height % 100 == 0) {
    //   Log.i(TAG, `Now at block: ${head.height}`);
    // }
  }
}