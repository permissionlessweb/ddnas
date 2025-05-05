import React from 'react';
import { JACKAL_API_ENDPOINTS } from '../config';

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  cid: string;
}

interface UploadResultsProps {
  files: UploadedFile[];
}

const UploadResults: React.FC<UploadResultsProps> = ({ files }) => {
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.startsWith('text/')) return '📄';
    if (type.includes('pdf')) return '📑';
    return '📁';
  };

  const formatDate = () => {
    const now = new Date();
    return now.toLocaleString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Create a direct link to the file on Jackal gateway
  const getFileUrl = (cid: string) => {
    // Ensure no double slashes in the URL
    const baseUrl = JACKAL_API_ENDPOINTS.GATEWAY.endsWith('/') 
      ? JACKAL_API_ENDPOINTS.GATEWAY.slice(0, -1) 
      : JACKAL_API_ENDPOINTS.GATEWAY;
    
    const cidPath = cid.startsWith('/') ? cid : `/${cid}`;
    const url = `${baseUrl}${cidPath}`;
    console.log(`Generated URL for CID ${cid}: ${url}`);
    return url;
  };

  return (
    <div>
      <h2>Uploaded Files</h2>
      <div className="file-list">
        {files.map((file) => (
          <div key={file.id} className="file-item">
            <div>
              <strong>{getFileIcon(file.type)} {file.name}</strong>
              <div>Type: {file.type}</div>
              <div>
                CID: {file.cid} 
                <button 
                  style={{ padding: '2px 5px', fontSize: '12px', marginLeft: '5px' }}
                  onClick={() => copyToClipboard(file.cid)}
                >
                  Copy
                </button>
              </div>
              <div>File ID: {file.id}</div>
              <div>Uploaded: {formatDate()}</div>
            </div>
            <div>
              <a 
                href={getFileUrl(file.cid)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="view-link"
              >
                View File
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UploadResults; 