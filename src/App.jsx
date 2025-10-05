import { useState, useEffect } from 'react';
import './App.css';
import { initAeSdk, connectToWallet, initContract, callContract, getAeSdk } from './lib/aeternity';

// The contractSource can remain the same
const contractSource = `...`;

function App() {
  const [isSdkReady, setIsSdkReady] = useState(false); // Use a boolean for SDK readiness
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [contract, setContract] = useState(null);
  const [grid, setGrid] = useState(Array(100).fill(null));
  const [status, setStatus] = useState('Initializing Aeternity SDK...');

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
      
      // The main fix: use the exported getter function
      const sdk = getAeSdk();
      const balance = await sdk.getBalance(walletInfo.address);
      setBalance(balance);
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
      setStatus('Contract deployed. Set treasures to start the game.');
    } catch(error) {
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
    while (treasures.length < 10) {
      const x = Math.floor(Math.random() * 10);
      const y = Math.floor(Math.random() * 10);
      if (!treasures.find(t => t.x === x && t.y === y)) {
        treasures.push({ x, y });
      }
    }
    try {
      await callContract('set_treasures', [treasures]);
      setStatus('Treasures set. Click on a tile to reveal.');
    } catch(error) {
      console.error(error);
      setStatus(`Failed to set treasures: ${error.message}`);
    }
  };

  const handleTileClick = async (index) => {
    if (!contract || grid[index] !== null) return;
    const x = index % 10;
    const y = Math.floor(index / 10);
    const loc = { x, y };
    const amount = 1000000000000000; // 0.001 AE

    try {
      setStatus(`Revealing tile (${x},${y})...`);
      // NOTE: The result of a stateful call does not directly return the value.
      // We are optimistically updating the UI based on whether the call succeeds or fails.
      // A more robust solution would be to query the contract state afterwards.
      await callContract('reveal', [loc], { amount });
      
      // Let's check the result from the contract state
      const revealedMapResult = await callContract('get_revealed', [], {});
      const isTreasure = revealedMapResult.decodedResult.find(([key, _val]) => key.x === x && key.y === y)[1];

      const newGrid = [...grid];
      newGrid[index] = isTreasure;
      setGrid(newGrid);
      setStatus(`Tile (${x},${y}) revealed: ${isTreasure ? 'Treasure!' : 'Empty.'}`);

      // Update balance
      const sdk = getAeSdk();
      const newBalance = await sdk.getBalance(address);
      setBalance(newBalance);

    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleResetGame = async () => {
    if (!contract) return;
    setStatus('Resetting game...');
    try {
      await callContract('reset_game', []);
      setGrid(Array(100).fill(null));
      setStatus('Game reset. Set treasures to start a new game.');
    } catch (error) {
      console.error(error);
      setStatus(`Failed to reset game: ${error.message}`);
    }
  };

  return (
    <div className="App bg-gray-900 text-white min-h-screen font-mono">
      <header className="App-header p-4 flex justify-between items-center border-b border-cyan-700">
        <h1 className="text-3xl text-cyan-400">Web3 Treasure Hunt</h1>
        {address ? (
          <div className="text-sm text-right">
            <p className="truncate">Address: <span className="text-cyan-300">{address}</span></p>
            <p>Balance: <span className="text-green-400">{(balance / 1e18).toFixed(4)} AE</span></p>
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
          <button onClick={handleDeployContract} disabled={!address} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-600">Deploy Contract</button>
          <button onClick={handleSetTreasures} disabled={!contract} className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-600">Set Treasures</button>
          <button onClick={handleResetGame} disabled={!contract} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-600">Reset Game</button>
        </div>
        <div className="grid grid-cols-10 gap-1 p-2 border border-cyan-800">
          {grid.map((cell, index) => (
            <div
              key={index}
              className={`w-12 h-12 border-2 flex items-center justify-center cursor-pointer transition-all duration-300
                ${
                  cell === true 
                  ? 'bg-yellow-500 border-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.8)]' // Treasure
                  : cell === false 
                  ? 'bg-gray-700 border-gray-600' // Empty
                  : 'bg-gray-900 border-cyan-400 hover:bg-cyan-900 hover:shadow-[0_0_15px_rgba(34,211,238,0.6)]' // Unrevealed
                }`}
              onClick={() => handleTileClick(index)}
            >
              {cell === true ? '💎' : ''}
            </div>
          ))}
        </div>
        <div className="status mt-4 p-2 bg-gray-800 rounded w-full max-w-xl text-center">
          <p className="text-cyan-300">> {status}</p>
        </div>
      </main>
    </div>
  );
}

export default App;