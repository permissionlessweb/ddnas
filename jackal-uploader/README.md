# Jackal File Uploader

A simple React TypeScript application to upload files to the Jackal Protocol.

## Features

- Connect using your Jackal Pin API key
- Drag and drop file uploads
- Multiple file support
- View uploaded files with direct links to Jackal IPFS gateway

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```
cd jackal-uploader
npm install
```

### Running the App

Start the development server:

```
npm start
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Building for Production

Create a production build:

```
npm run build
```

## Usage

1. Enter your Jackal Pin API key and click "Connect"
2. Drag and drop files into the upload area or click to browse
3. Click "Upload to Jackal" to start the upload
4. View uploaded files with links to access them on Jackal's IPFS gateway

## Notes

- This app directly connects to the Jackal Pin API at `https://pinapi.jackalprotocol.com`
- Your API key is stored only in the browser's memory and is never saved
- Files are accessed through the Jackal gateway at `https://gateway.jackalprotocol.com/ipfs/` 