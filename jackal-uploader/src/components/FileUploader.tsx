import React, { useState, useRef } from 'react';
import { JACKAL_API_ENDPOINTS, APP_CONFIG } from '../config';

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  cid: string;
}

interface FileUploaderProps {
  apiKey: string;
  onUploadSuccess: (files: UploadedFile[]) => void;
  onUploadError: (error: string) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ 
  apiKey, 
  onUploadSuccess, 
  onUploadError 
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFiles = (files: File[]): { valid: boolean; message?: string } => {
    // Check if any files are too large
    const oversizedFiles = files.filter(file => file.size > APP_CONFIG.MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(', ');
      const maxSizeMB = APP_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
      return {
        valid: false,
        message: `The following files exceed the maximum size of ${maxSizeMB}MB: ${fileNames}`
      };
    }
    
    return { valid: true };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileArray = Array.from(e.target.files);
      const validation = validateFiles(fileArray);
      
      if (!validation.valid) {
        onUploadError(validation.message || 'Invalid files');
        return;
      }
      
      setSelectedFiles(fileArray);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileArray = Array.from(e.dataTransfer.files);
      const validation = validateFiles(fileArray);
      
      if (!validation.valid) {
        onUploadError(validation.message || 'Invalid files');
        return;
      }
      
      setSelectedFiles(fileArray);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      onUploadError('Please select at least one file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      
      // Jackal API requires files to be appended with the key "files"
      selectedFiles.forEach((file) => {
        // Use "files" as the form field name according to Jackal API docs
        formData.append("files", file);
        console.log(`Adding file: ${file.name}, size: ${file.size} bytes`);
      });

      // Log the form data keys for debugging
      const formDataKeys: string[] = [];
      formData.forEach((value, key) => {
        formDataKeys.push(key);
      });
      console.log('FormData keys:', formDataKeys);

      // Create a controller for progress tracking and cancellation
      const controller = new AbortController();
      const signal = controller.signal;

      if (APP_CONFIG.DEBUG_MODE) {
        console.log('Uploading files to:', JACKAL_API_ENDPOINTS.UPLOAD_FILES);
        console.log('Number of files:', selectedFiles.length);
      }

      const response = await fetch(JACKAL_API_ENDPOINTS.UPLOAD_FILES, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
        signal,
      });

      // Log the raw response for debugging
      console.log('Response status:', response.status);
      // Convert headers to a regular object instead of using spread operator
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      console.log('Response headers:', JSON.stringify(headers));

      if (!response.ok) {
        let errorMessage = 'Upload failed';
        try {
          const errorData = await response.json();
          console.error('Error response:', errorData);
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // If JSON parsing fails, use response status text
          errorMessage = `HTTP error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Get the response as text first to see what we're dealing with
      const responseText = await response.text();
      console.log('Raw response:', responseText);
      
      // Then parse it as JSON if it looks like JSON
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Parsed response data:', data);
      } catch (e) {
        console.error('Failed to parse response as JSON:', e);
        onUploadError('Received non-JSON response from server');
        setIsUploading(false);
        return;
      }
      
      // Map the response to the expected format
      const uploadedFiles = Array.isArray(data) 
        ? data.map((file: any, index: number) => {
            console.log(`Processing file ${index}:`, file);
            return {
              id: file.fileId || file.id || `file-${index}`,
              name: selectedFiles[index].name,
              type: selectedFiles[index].type,
              cid: file.cid || file.fileId || '',
            };
          })
        : (() => {
            console.log('Processing single file response:', data);
            // Check if this is a Jackal-specific response format
            if (data.fileId || data.cid) {
              return [{
                id: data.fileId || 'file-0',
                name: selectedFiles[0].name,
                type: selectedFiles[0].type,
                cid: data.cid || data.fileId || '',
              }];
            } 
            // Handle case where the response is just a string or simple object
            else if (typeof data === 'string') {
              return [{
                id: 'file-0',
                name: selectedFiles[0].name,
                type: selectedFiles[0].type,
                cid: data,
              }];
            } 
            // Fallback for other response formats
            else {
              return [{
                id: 'file-0',
                name: selectedFiles[0].name,
                type: selectedFiles[0].type,
                cid: JSON.stringify(data),
              }];
            }
          })();
      
      console.log('Processed uploaded files:', uploadedFiles);
      onUploadSuccess(uploadedFiles);
      setSelectedFiles([]);
      setUploadProgress(100);
    } catch (error) {
      console.error('Upload error:', error);
      onUploadError(`Error: ${error instanceof Error ? error.message : 'Failed to upload files'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <h2>Upload Files</h2>
      <div 
        className="dropzone"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
      >
        <p>Drag and drop files here, or click to browse</p>
        <p className="dropzone-subtext">Maximum file size: {APP_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB</p>
        <input 
          type="file" 
          multiple 
          onChange={handleFileChange} 
          style={{ display: 'none' }}
          ref={fileInputRef}
        />
      </div>

      {selectedFiles.length > 0 && (
        <div className="file-list">
          <h3>Selected Files ({selectedFiles.length})</h3>
          {selectedFiles.map((file, index) => (
            <div key={index} className="file-item">
              <span>{file.name}</span>
              <span>{(file.size / 1024).toFixed(2)} KB</span>
            </div>
          ))}
          <div style={{ marginTop: '10px' }}>
            <button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Upload to Jackal'}
            </button>
            <button onClick={clearSelectedFiles} disabled={isUploading}>
              Clear
            </button>
          </div>
          {isUploading && (
            <div className="progress-bar-container">
              <div 
                className="progress-bar" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUploader; 