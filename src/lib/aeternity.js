import {
  AeSdkAepp,
  walletDetector,
  BrowserWindowMessageConnection,
  Node,
} from '@aeternity/aepp-sdk';

const TESTNET_NODE_URL = 'https://testnet.aeternity.io';
const COMPILER_URL = 'https://compiler.aeternity.io';

let aeSdk;
let contract;

export const getAeSdk = () => {
  if (!aeSdk) throw new Error('AeSdk is not initialized');
  return aeSdk;
};

export const initAeSdk = async () => {
  if (aeSdk) return aeSdk;

  aeSdk = new AeSdkAepp({
    name: 'Treasure Hunt DApp',
    nodes: [{ name: 'testnet', instance: new Node(TESTNET_NODE_URL) }],
    compilerUrl: COMPILER_URL,
  });

  return aeSdk;
};

export const connectToWallet = async () => {
  if (!aeSdk) await initAeSdk();

  return new Promise((resolve, reject) => {
    const connection = new BrowserWindowMessageConnection();

    const stopScan = walletDetector(connection, async ({ newWallet }) => {
      stopScan();

      if (!window.confirm(`Connect to wallet "${newWallet.info.name}"?`)) {
        return reject('User rejected wallet connection');
      }

      try {
        // 1️⃣ Establish AEPP <-> Wallet bridge
        await aeSdk.connectToWallet(newWallet.getConnection());

        // 2️⃣ Try normal subscribe
        let accounts = {};
        try {
          accounts = await aeSdk.subscribeAddress('subscribe', 'connected');
        } catch {
          console.warn('Fallback to manual account request...');
        }

        console.log('Raw wallet accounts response:', accounts);

        // 3️⃣ Try all possible fields where wallet might store accounts
        // After getting accounts
        const currentObj = accounts?.address?.current;
        if (!currentObj || typeof currentObj !== 'object') {
        throw new Error('No valid Aeternity account found');
        }

        // Extract the key (actual AE address)
        const currentAddress = Object.keys(currentObj)[0];

        if (!currentAddress || !currentAddress.startsWith('ak_')) {
        throw new Error('No valid Aeternity account found');
        }

        console.log('✅ Connected address:', currentAddress);
        resolve({ address: currentAddress });

      } catch (err) {
        console.error('❌ Wallet connection error:', err);
        reject(err);
      }
    });

    setTimeout(() => {
      stopScan();
      reject('No wallet detected');
    }, 10000);
  });
};




export const initContract = async (source) => {
  if (!aeSdk) throw new Error('AeSdk is not initialized');
  const contractInstance = await aeSdk.initializeContract({ source });
  await contractInstance.$deploy([]);
  contract = contractInstance;
  return contract;
};

export const callContract = async (func, args = [], options = {}) => {
  if (!contract) throw new Error('Contract is not initialized');
  const result = await contract.$call(func, args, options);
  return result;
};
