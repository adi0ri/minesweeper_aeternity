import { AeSdk, Node, MemoryAccount } from '@aeternity/aepp-sdk';
import contractSource from '../../contracts/Minesweeper.aes?raw';
import { TREASURY_PUBLIC_KEY, TREASURY_SECRET_KEY } from '../treasury.config';

// Single, private AeSdk bound to the Treasury account
let treasurySdk;

export async function initTreasurySdk(nodeUrl = 'https://testnet.aeternity.io') {
  if (treasurySdk) return treasurySdk;
  const node = new Node(nodeUrl);
  treasurySdk = new AeSdk({
    nodes: [{ name: 'testnet', instance: node }],
    accounts: [new MemoryAccount(TREASURY_SECRET_KEY)],
  });
  return treasurySdk;
}

export function getTreasuryAddress() {
  return TREASURY_PUBLIC_KEY;
}

// Initialize a contract instance for the treasury SDK, pointing to an already deployed contract
async function treasuryContractAt(address) {
  const sdk = await initTreasurySdk();
  // The `getContractInstance` method is deprecated, using the new `Contract.initialize` syntax
  const contractInstance = await sdk.getContractInstance({ source: contractSource, contractAddress: address });
  return contractInstance;
}

/**
 * Trigger reward payout via contract (treasury-only entrypoint).
 * @param {string} contractAddress - deployed contract address
 * @param {string} playerAddress   - player recipient
 * @param {{x:number,y:number}} loc - tile coordinates
 * @param {bigint|number} amountAettos - reward amount sent as Call.value
 */
export async function payoutReward(contractAddress, playerAddress, loc, amountAettos) {
  const c = await treasuryContractAt(contractAddress);
  const res = await c.methods.treasury_payout(playerAddress, loc, { amount: BigInt(amountAettos) });
  return res;
}