import React, { useState } from 'react';

interface ApiKeyInputProps {
  onConnect: (key: string) => void;
  onDisconnect: () => void;
  isConnected: boolean;
}

const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ 
  onConnect, 
  onDisconnect, 
  isConnected 
}) => {
  const [key, setKey] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect(key);
  };

  return (
    <div>
      <h2>{isConnected ? 'Connected to Jackal API' : 'Connect to Jackal API'}</h2>
      
      {!isConnected ? (
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="apiKey">Jackal Pin API Key</label>
            <input
              id="apiKey"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your Jackal Pin API key"
              required
            />
          </div>
          <button type="submit">Connect</button>
        </form>
      ) : (
        <div>
          <p>You are connected to Jackal API with your API key.</p>
          <button onClick={onDisconnect}>Disconnect</button>
        </div>
      )}
    </div>
  );
};

export default ApiKeyInput; 