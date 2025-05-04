import React, { useState } from 'react';
import ApiKeyInput from './components/ApiKeyInput';
import FileUploader from './components/FileUploader';
import UploadResults from './components/UploadResults';

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  cid: string;
}

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = (key: string) => {
    if (!key.trim()) {
      setError('API key is required');
      return;
    }
    
    setApiKey(key);
    setIsConnected(true);
    setError(null);
  };

  const handleDisconnect = () => {
    setApiKey('');
    setIsConnected(false);
    setUploadedFiles([]);
  };

  const handleUploadSuccess = (files: UploadedFile[]) => {
    setUploadedFiles((prev) => [...prev, ...files]);
    setError(null);
  };

  const handleUploadError = (errorMsg: string) => {
    setError(errorMsg);
  };

  return (
    <div className="container">
      <h1>Jackal File Uploader</h1>
      
      <div className="card">
        <ApiKeyInput 
          onConnect={handleConnect} 
          onDisconnect={handleDisconnect} 
          isConnected={isConnected}
        />
      </div>

      {isConnected && (
        <div className="card">
          <FileUploader 
            apiKey={apiKey} 
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
          />
        </div>
      )}

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="card">
          <UploadResults files={uploadedFiles} />
        </div>
      )}
    </div>
  );
};

export default App; 