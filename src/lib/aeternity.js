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
        await aeSdk.connectToWallet(await newWallet.getConnection());

        // 2️⃣ Try normal subscribe
        let currentAddress;
        try {
          const accounts = await aeSdk.subscribeAddress('subscribe', 'connected');
          const currentObj = accounts?.address?.current;
          if (currentObj && typeof currentObj === 'object') {
            currentAddress = Object.keys(currentObj)[0];
          }
      } catch {}
      if (!currentAddress) currentAddress = await aeSdk.address(); // fallback
      if (!currentAddress?.startsWith?.('ak_')) throw new Error('No valid Aeternity account found');
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
    ...aeSdk.getContext(),
    sourceCode,
  });
  const deployInfo = await contractInstance.$deploy([]);      // ⬅️ capture result
  contractInstance.deployInfo = deployInfo;                    // ⬅️ attach it
  contract = contractInstance;
  return contractInstance; // App.jsx can read .deployInfo.address safely now
};

export const callContract = async (fn, args = [], options = {}) => {
  if (!contract) throw new Error('Contract not initialized');

  const { callStatic, ...rest } = options;
  // Only do a dry-run when explicitly requested
  const callOpts = callStatic ? { ...rest, callStatic: true } : { ...rest };

  return contract.$call(fn, args, callOpts);
};

