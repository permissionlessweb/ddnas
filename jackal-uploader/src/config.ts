// Jackal API configuration
export const JACKAL_API_ENDPOINTS = {
  // File upload endpoint (the correct V1 endpoint)
  UPLOAD_FILES: 'https://pinapi.jackalprotocol.com/api/v1/files',
  
  // Gateway for accessing uploaded files (using a properly formed URL)
  GATEWAY: 'https://gateway.jackalprotocol.com/ipfs',
  
  // Collections endpoint for organizing files
  COLLECTIONS: 'https://pinapi.jackalprotocol.com/api/collections',
};

// Feature flags and configuration options
export const APP_CONFIG = {
  // Maximum file size allowed (in bytes) - 100MB
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  
  // Whether to show debug information in the console
  DEBUG_MODE: true, // Always show debug info for now to troubleshoot
  
  // Version information
  VERSION: '1.0.0',
}; 