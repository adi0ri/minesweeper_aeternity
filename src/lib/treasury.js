// src/lib/treasury.js
import { AeSdk, Node, MemoryAccount, Contract, CompilerHttp } from '@aeternity/aepp-sdk';
import contractSource from '../../contracts/Minesweeper.aes?raw';
import { TREASURY_PUBLIC_KEY, TREASURY_SECRET_KEY } from '../treasury.config';
import { callContract, getAeSdk } from './aeternity';

// ------------------------------
// Treasury AeSdk (single-instance)
// ------------------------------
let treasurySdk;

/**
 * Initialize the AeSdk bound to the Treasury account.
 * Provide a compiler so Contract.initialize can derive ACI from source.
 */
export async function initTreasurySdk(
  nodeUrl = 'https://testnet.aeternity.io',
  compilerUrl = (typeof window !== 'undefined'
    ? `${window.location.origin}/compiler`
    : 'https://v8.compiler.aepps.com')
) {
  if (treasurySdk) return treasurySdk;

  const node = new Node(nodeUrl);
  const onCompiler = new CompilerHttp(compilerUrl);

  treasurySdk = new AeSdk({
    nodes: [{ name: 'testnet', instance: node }],
    accounts: [new MemoryAccount(TREASURY_SECRET_KEY)],
    onCompiler,
  });

  return treasurySdk;
}

export function getTreasuryAddress() {
  return TREASURY_PUBLIC_KEY;
}

// ------------------------------
// Contract helpers (Treasury side)
// ------------------------------

/**
 * Initialize a contract instance (pointing to an already deployed contract).
 * Uses Contract.initialize (modern API) with sourceCode + address.
 */
async function treasuryContractAt(address) {
  const sdk = await initTreasurySdk();
  const contract = await Contract.initialize({
    ...sdk.getContext(),
    sourceCode: contractSource,
    address, // already deployed
  });
  return contract;
}

/**
 * Safe coercion to bigint (aettos). Throws with a clear message if missing.
 */
function toBigIntAettos(value, label = 'amount') {
  if (value === undefined || value === null) {
    throw new Error(`Missing ${label}; provide it or set it on-chain first`);
  }
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} is not finite`);
    if (!Number.isInteger(value)) throw new Error(`${label} must be an integer (aettos)`);
    return BigInt(value);
  }
  // strings (or anything else stringify-able)
  return BigInt(String(value));
}

/**
 * Trigger reward payout via contract (treasury-only entrypoint).
 * @param {string} contractAddress - deployed contract address (ct_...)
 * @param {string} playerAddress   - player recipient (ak_...)
 * @param {{x:number,y:number}} loc - tile coordinates
 * @param {bigint|number|string} amountAettos - reward amount (aettos)
 */
export async function payoutReward(contractAddress, playerAddress, loc, amountAettos) {
  const c = await treasuryContractAt(contractAddress);
  const amt = toBigIntAettos(amountAettos, 'reward amount');
  // Payable + stateful; call directly
  return c.treasury_payout(playerAddress, loc, { amount: amt });
}

// ------------------------------
// UI integration: reveal via treasury.js
// ------------------------------

/**
 * Normalize possible shapes of a Sophia map(loc,bool) returned by older decoders.
 * Fallback only (we prefer using `revealed_at`).
 */
function normalizeMapPairs(decoded) {
  if (Array.isArray(decoded)) return decoded;
  if (decoded instanceof Map) return Array.from(decoded.entries());
  if (decoded && typeof decoded === 'object') {
    return Object.entries(decoded).map(([k, v]) => {
      try {
        const key = JSON.parse(k); // e.g. '{"x":3,"y":7}'
        return [key, v];
      } catch {
        const m = String(k).match(/(-?\d+)\D+(-?\d+)/);
        const key = m ? { x: Number(m[1]), y: Number(m[2]) } : { x: undefined, y: undefined };
        return [key, v];
      }
    });
  }
  return [];
}

/**
 * Reveal a tile from the player's account, update UI, and (if treasure) pay reward from Treasury.
 * If fee/reward are not passed in, they are fetched from the contract.
 *
 * @param {number} x
 * @param {number} y
 * @param {{
 *   updateTile: (x:number, y:number, isTreasure:boolean)=>void,
 *   setStatus: (msg:string)=>void,
 *   address: string,           // player ak_...
 *   contractAddress: string,   // ct_...
 *   feeAettos?: bigint|number|string,     // optional reveal fee override
 *   rewardAettos?: bigint|number|string,  // optional reward override
 * }} ctx
 */
export async function revealTileWithTreasury(x, y, ctx) {
  const { updateTile, setStatus, address, contractAddress } = ctx;
  let { feeAettos, rewardAettos } = ctx;
  const loc = { x, y };

  try {
    // If caller didn't pass fees/rewards, read them from chain
    if (feeAettos === undefined) {
      const { decodedResult } = await callContract('get_reveal_fee', [], { callStatic: true });
      feeAettos = decodedResult; // could be number or string depending on decoder
    }
    if (rewardAettos === undefined) {
      const { decodedResult } = await callContract('get_reward_amount', [], { callStatic: true });
      rewardAettos = decodedResult;
    }

    const fee = toBigIntAettos(feeAettos, 'reveal fee');
    const reward = toBigIntAettos(rewardAettos, 'reward amount');

    setStatus(`Revealing tile (${x},${y})...`);
    // Player pays the exact fee required by the contract
    await callContract('reveal', [loc], { amount: fee });

    // Prefer single-cell getter for robustness (if present)
    let isTreasure;
    try {
      const { decodedResult } = await callContract('revealed_at', [loc], { callStatic: true });
      isTreasure = !!decodedResult;
    } catch {
      // Fallback if `revealed_at` isn't available yet
      const res = await callContract('get_revealed', [], { callStatic: true });
      const pairs = normalizeMapPairs(res.decodedResult);
      const tuple = pairs.find(([key]) => key && key.x === x && key.y === y);
      isTreasure = !!(tuple && tuple[1]);
    }

    updateTile(x, y, isTreasure);
    setStatus(isTreasure ? '💎 Treasure!' : '❌ Empty.');

    if (isTreasure) {
      setStatus('Treasure found! Treasury paying reward...');
      await payoutReward(contractAddress, address, loc, reward);
      // Display AE amount (not aettos) for UX only
      setStatus(`Reward of ${Number(String(reward)) / 1e18} AE paid!`);
    }

    // Refresh player balance
    const sdk = getAeSdk();
    const newBalance = await sdk.getBalance(address);

    return { isTreasure, newBalance };
  } catch (e) {
    console.error(e);
    setStatus(`Reveal failed: ${e.message}`);
    throw e;
  }
}
