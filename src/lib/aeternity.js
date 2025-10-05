import {
    AeSdk, walletDetector, BrowserWindowMessageConnection, Node
} from '@aeternity/aepp-sdk';

const TESTNET_NODE_URL = 'https://testnet.aeternity.io';
const COMPILER_URL = 'https://compiler.aeternity.io'; // Using the official compiler URL

let aeSdk;
let contract;

export const getAeSdk = () => {
    if (!aeSdk) throw new Error('AeSdk is not initialized');
    return aeSdk;
};

export const initAeSdk = async () => {
    if (aeSdk) return;

    aeSdk = new AeSdk({
        nodes: [{ name: 'testnet', instance: new Node(TESTNET_NODE_URL) }],
        compilerUrl: COMPILER_URL,
    });

    return aeSdk;
};

export const connectToWallet = async () => {
    if (!aeSdk) await initAeSdk();

    return new Promise((resolve, reject) => {
        const scannerConnection = new BrowserWindowMessageConnection();
        const detector = walletDetector(scannerConnection, ({ newWallet }) => {
            if (window.confirm(`Do you want to connect to wallet ${newWallet.info.name}?`)) {
                detector.stopScan();
                resolve(newWallet);
            }
        });

        const stopScan = setTimeout(() => {
            detector.stopScan();
            reject('No wallet found');
        }, 10000); // Stop scanning after 10 seconds

        detector.scan();
    }).then(async (wallet) => {
        await aeSdk.connectToWallet(wallet.getConnection());
        const addresses = await aeSdk.subscribeToAccounts('connected');
        return addresses.connected[Object.keys(addresses.connected)[0]];
    });
};

export const initContract = async (source) => {
    if (!aeSdk) throw new Error('AeSdk is not initialized');
    // The main fix: getContractInstance is a method on the aeSdk instance
    contract = await aeSdk.getContractInstance({ source });
    await contract.deploy();
    return contract;
};

export const callContract = async (func, args, options) => {
    if (!contract) throw new Error('Contract is not initialized');
    const result = await contract.methods[func](...args, options);
    return result;
};