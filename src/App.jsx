import { useState, useEffect } from 'react';
import './App.css';
import { initAeSdk, connectToWallet, initContract, callContract, getAeSdk } from './lib/aeternity';
import contractSource from '../contracts/Minesweeper.aes?raw';

// Import treasury helpers and configuration
import { getTreasuryAddress, revealTileWithTreasury } from './lib/treasury';
import { DEFAULT_REVEAL_FEE, DEFAULT_REWARD } from './treasury.config';

const GRID_W = 3;
const GRID_H = 3;
const BOMB_COUNT = 1; // 👈 tune if you want more bombs

function App() {
  const [isSdkReady, setIsSdkReady] = useState(false);
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [contract, setContract] = useState(null);
  const [contractAddress, setContractAddress] = useState(null);

  // grid holds: null (unrevealed) | true (treasure) | false (empty) | 'bomb' (bomb hit)
  const [grid, setGrid] = useState(Array(GRID_W * GRID_H).fill(null));

  const [status, setStatus] = useState('Initializing Aeternity SDK...');
  const [bombs, setBombs] = useState([]);    // [{x,y}]
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await initAeSdk();
        setIsSdkReady(true);
        setStatus('SDK Initialized. Please connect your wallet.');
      } catch (error) {
        console.error(error);
        setStatus('SDK initialization failed. Please refresh.');
      }
    };
    init();
  }, []);

  const handleConnectWallet = async () => {
    try {
      setStatus('Connecting to wallet...');
      const walletInfo = await connectToWallet();
      setAddress(walletInfo.address);

      const sdk = getAeSdk();
      const bal = await sdk.getBalance(walletInfo.address);
      setBalance(bal);
      setStatus('Wallet connected. Deploy the contract to start.');
    } catch (error) {
      console.error(error);
      setStatus(`Wallet connection failed: ${error}`);
    }
  };

  const handleDeployContract = async () => {
    try {
      setStatus('Deploying contract...');
      const contractInstance = await initContract(contractSource);
      setContract(contractInstance);

      const deployedAddress = contractInstance.deployInfo.address;
      setContractAddress(deployedAddress);
      setStatus('Contract deployed. Configuring treasury...');

      await callContract('set_treasury', [getTreasuryAddress()]);
      await callContract('set_reveal_fee', [String(DEFAULT_REVEAL_FEE)]);
      await callContract('set_reward_amount', [String(DEFAULT_REWARD)]);

      setStatus('Contract deployed & treasury configured. Set treasures to start the game.');
    } catch (error) {
      console.error(error);
      setStatus(`Contract deployment failed: ${error.message}`);
    }
  };

  const handleSetTreasures = async () => {
    if (!contract) {
      setStatus('Deploy the contract first!');
      return;
    }

    setStatus('Setting treasures on the blockchain...');
    const treasures = [];
    while (treasures.length < 4) {
      const x = Math.floor(Math.random() * GRID_W);
      const y = Math.floor(Math.random() * GRID_H);
      if (!treasures.find(t => t.x === x && t.y === y)) treasures.push({ x, y });
    }

    // 👉 client-side bombs: never overlap with any treasure
    const bombsLocal = [];
    while (bombsLocal.length < BOMB_COUNT) {
      const x = Math.floor(Math.random() * GRID_W);
      const y = Math.floor(Math.random() * GRID_H);
      const clashTreasure = treasures.some(t => t.x === x && t.y === y);
      const clashBomb = bombsLocal.some(b => b.x === x && b.y === y);
      if (!clashTreasure && !clashBomb) bombsLocal.push({ x, y });
    }

    try {
      await callContract('set_treasures', [treasures]);
      setBombs(bombsLocal);
      setGrid(Array(GRID_W * GRID_H).fill(null));
      setGameOver(false);
      setStatus('Treasures set. Click a tile to reveal — but beware of bombs 💣!');
    } catch (error) {
      console.error(error);
      setStatus(`Failed to set treasures: ${error.message}`);
    }
  };

  const handleTileClick = async (index) => {
    if (!contract || !contractAddress || grid[index] !== null || gameOver) return;

    const x = index % GRID_W;
    const y = Math.floor(index / GRID_W);

    // 💣 If this is a bomb, end the game immediately (no chain call)
    if (bombs.some(b => b.x === x && b.y === y)) {
      setGrid((g) => {
        const ng = [...g];
        ng[index] = 'bomb';
        return ng;
      });
      setGameOver(true);
      setStatus('💥 Boom! You hit a bomb. Game over.');
      return;
    }

    // Normal on-chain reveal for treasure/empty
    await revealTileWithTreasury(x, y, {
      updateTile: (tx, ty, isTreasure) => {
        const idx = ty * GRID_W + tx;
        setGrid((g) => {
          const ng = [...g];
          ng[idx] = isTreasure; // true = treasure, false = empty
          return ng;
        });
      },
      setStatus,
      address,
      contractAddress,
    })
      .then(({ newBalance }) => {
        if (newBalance != null) setBalance(newBalance);
      })
      .catch(() => {});
  };

  const handleResetGame = async () => {
    if (!contract) return;
    setStatus('Resetting game...');
    try {
      await callContract('reset_game', []);
      setGrid(Array(GRID_W * GRID_H).fill(null));
      setBombs([]);
      setGameOver(false);
      setStatus('Game reset. Set treasures to start a new game.');
    } catch (error) {
      console.error(error);
      setStatus(`Failed to reset game: ${error.message}`);
    }
  };

  // Existing helper kept as-is
  const normalizeMapPairs = (decoded) => {
    if (Array.isArray(decoded)) return decoded;
    if (decoded instanceof Map) return Array.from(decoded.entries());

    if (decoded && typeof decoded === 'object') {
      return Object.entries(decoded).map(([k, v]) => {
        let key = null;
        try {
          key = JSON.parse(k);
        } catch {
          const m = String(k).match(/(-?\d+)\D+(-?\d+)/);
          key = m ? { x: Number(m[1]), y: Number(m[2]) } : { x: undefined, y: undefined };
        }
        return [key, v];
      });
    }
    return [];
  };

  return (
    <div className="App bg-gray-900 text-white min-h-screen font-mono">
      <header className="App-header p-4 flex justify-between items-center border-b border-cyan-700">
        <h1 className="text-3xl text-cyan-400">Web3 Treasure Hunt</h1>
        {address ? (
          <div className="text-sm text-right">
            <p className="truncate">Address: <span className="text-cyan-300">{address}</span></p>
            <p>Balance: <span className="text-green-400">{(Number(String(balance)) / 1e18).toFixed(4)} AE</span></p>
          </div>
        ) : (
          <button
            onClick={handleConnectWallet}
            disabled={!isSdkReady}
            className="bg-cyan-500 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-600">
            Connect Wallet
          </button>
        )}
      </header>

      <main className="p-4 flex flex-col items-center">
        <div className="controls space-x-2 mb-4">
          <button onClick={handleDeployContract} disabled={!address || contract} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-600">Deploy Contract</button>
          <button onClick={handleSetTreasures} disabled={!contract} className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-600">Set Treasures</button>
          <button onClick={handleResetGame} disabled={!contract} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-600">Reset Game</button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-2 border border-cyan-800">
          {grid.map((cell, index) => {
            const isBomb = cell === 'bomb';
            const isTreasure = cell === true;
            const isEmpty = cell === false;
            const isRevealed = cell !== null;

            return (
              <div
                key={index}
                className={`w-12 h-12 border-2 flex items-center justify-center transition-all duration-300
                  ${isBomb
                    ? 'bg-red-700 border-red-400 shadow-[0_0_18px_rgba(248,113,113,0.9)]'
                    : isTreasure
                    ? 'bg-yellow-500 border-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.8)]'
                    : isEmpty
                    ? 'bg-gray-700 border-gray-600'
                    : 'bg-gray-900 border-cyan-400 hover:bg-cyan-900 hover:shadow-[0_0_15px_rgba(34,211,238,0.6)]'
                  }
                  ${gameOver && !isRevealed ? 'opacity-60' : ''} 
                  ${gameOver || isRevealed ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}
                onClick={() => !gameOver && handleTileClick(index)}
              >
                {isBomb ? '💣' : isTreasure ? '💎' : ''}
              </div>
            );
          })}
        </div>

        <div className="status mt-4 p-2 bg-gray-800 rounded w-full max-w-xl text-center">
          <p className="text-cyan-300">{status}</p>
        </div>
      </main>
    </div>
  );
}

export default App;
