import {
  AeSdkAepp,
  Node,
  BrowserWindowMessageConnection,
  walletDetector,
  CompilerHttp,
  Contract,
} from '@aeternity/aepp-sdk';

const NODE_URL = 'https://testnet.aeternity.io';
const COMPILER_URL = `${window.location.origin}/compiler`;

let aeSdk;
let contract;
export const getAeSdk = () => {
  if (!aeSdk) throw new Error('AeSdk is not initialized');
  return aeSdk;
};

export const initAeSdk = async () => {
  if (aeSdk) return aeSdk;

  const nodeInstance = new Node(NODE_URL);
  const compiler = new CompilerHttp(COMPILER_URL);

  aeSdk = new AeSdkAepp({
    name: 'Minesweeper DApp',
    nodes: [{ name: 'testnet', instance: nodeInstance }],
    onCompiler: compiler,
  });

  // connect wallet popup
  const connection = new BrowserWindowMessageConnection();
  walletDetector(connection);

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

export const initContract = async (sourceCode) => {
  if (!aeSdk) throw new Error('AeSdk not initialized');
  const contractInstance = await Contract.initialize({
    ...aeSdk.getContext(), // injects node + account + compiler
    sourceCode,
  });
  await contractInstance.$deploy([]); // or await contractInstance.init(...)
  contract = contractInstance;
  return contract;
};

// -------- Call contract entrypoints ----------
export const callContract = async (fn, args = [], options = {}) => {
  if (!contract) throw new Error('Contract not initialized');
  const result = await contract.methods[fn](...(args ?? []), options);
  return result;
};
