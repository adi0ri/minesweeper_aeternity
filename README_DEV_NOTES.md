# Developer Notes: Treasury System

This document explains the treasury and reward payout mechanism in the Web3 Treasure Hunt game.

## Treasury Wallet

The treasury is a separate, hard-coded æternity account defined in `src/treasury.config.js`. Its keys can be provided via environment variables (`VITE_TREASURY_PUB`, `VITE_TREASURY_PRIV`) or set directly in the file for development.

**This account needs to be funded with some AE on the Testnet to be able to pay out rewards.**

## Reveal Fee Flow

1.  When a player clicks a tile, the UI calls the `reveal` entrypoint on the smart contract.
2.  The call includes a `Call.value` equal to the `reveal_fee` (e.g., 0.001 AE).
3.  The `reveal` function in the contract is `payable`. Upon successful execution, it immediately forwards the received `Call.value` to the treasury address using `Chain.spend(state.treasury, Call.value)`.

This fee transfer is automatic and happens entirely within the contract logic.

## Reward Payout Flow

Rewards are not paid directly from the treasury wallet to the player. They are routed through the smart contract to ensure payouts are only for legitimate, verified treasure finds.

1.  After the player's `reveal` transaction confirms, the UI checks if the revealed tile was a treasure.
2.  If it was a treasure, the UI calls the `payoutReward` function in `src/lib/treasury.js`.
3.  This function uses an independent `AeSdk` instance, initialized with the treasury's secret key, to call the `treasury_payout` entrypoint on the smart contract.
4.  The `treasury_payout` call includes a `Call.value` equal to the `reward_amount` (e.g., 0.005 AE). This amount is sent from the **Treasury's wallet** to the **contract**.
5.  The `treasury_payout` entrypoint verifies:
    *   The caller is the official treasury address.
    *   The specified tile is a revealed treasure.
    *   A reward has not already been paid for this tile.
6.  If all checks pass, the contract immediately forwards the received `Call.value` to the player using `Chain.spend(player, Call.value)`.

This **Treasury -> Contract -> Player** flow ensures that the treasury's funds are only dispersed according to the game's rules, as enforced by the smart contract.