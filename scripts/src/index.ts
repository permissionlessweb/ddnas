import { OfflineSigner } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient, CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { fromBase64, toHex } from "@cosmjs/encoding";
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import dotenv from 'dotenv';
import { makeSignDoc, Secp256k1HdWallet } from "@cosmjs/amino";
import { RequestBody, Auth, RegisterDnasKeyRequest, ProfileDnasKeyWithValue, UseDnasKeyRequest, FetchProfileResponse, RegisterDnasKeyResponse, FetchedProfile, SignatureOptions, SignedBody } from 'dnas/src/types'

dotenv.config();

// API and RPC configuration
const LOCAL_RPC = process.env.LOCAL_RPC || "https://juno-rpc.polkachu.com:443";
const API_BASE = process.env.API_BASE || "http://localhost:58229"; // Your local API server endpoint

// Helper function to initialize wallet from mnemonic
async function initializeWallet(mnemonic: string): Promise<OfflineSigner> {
    const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: "juno", // Change to your chain's prefix if needed
    });
    return wallet as OfflineSigner;
}

// Helper function to make authenticated API request
async function sendSignedRequest(
    apiBase: string,
    endpoint: string,
    wallet: OfflineSigner,
    address: string,
    hexPublicKey: string,
    data: any = {},
    signatureType: string,
) {
    // Get offline signer for amino 
    const offlineSignerAmino = wallet as any;
    if (!offlineSignerAmino || !('signAmino' in offlineSignerAmino)) {
        throw new Error('Wallet does not support amino signing');
    }

    // Get nonce from API
    const nonce = await getNonce(apiBase, hexPublicKey);

    // Chain ID from the wallet (for Juno)
    const chainId = "juno-1"; // Adjust based on your environment
    console.log("DATA:", data)

    // Check if we're using the new Auth structure
    if (data.dnasApiKeys && Array.isArray(data.dnasApiKeys)) {
        // For DNAS key registration structure
        for (const apiKey of data.dnasApiKeys) {
            const messageToSign = {
                type: signatureType,
                nonce: apiKey.data.auth.nonce,
                chain_id: apiKey.data.auth.chainId,
                address,
                public_key: hexPublicKey,
                data: apiKey.data
            };

            // Sign the message
            const { signature } = await offlineSignerAmino.signAmino(
                address,
                {
                    chain_id: chainId,
                    account_number: "0",
                    sequence: "0",
                    fee: { amount: [], gas: "0" },
                    msgs: [
                        {
                            type: "sign/MsgSignData",
                            value: {
                                signer: address,
                                data: Buffer.from(JSON.stringify(messageToSign)).toString("base64"),
                            },
                        },
                    ],
                    memo: "",
                }
            );

            // Assign the signature
            apiKey.signature = signature.signature;
        }

        // Return the modified data without additional wrapping
        return data;
    }

    console.log("signing offchainAuth with:", signatureType)

    // Sign the request
    const signedBody = await signOffChainAuth({
        type: signatureType,
        nonce,
        chainId,
        address,
        hexPublicKey,
        data,
        offlineSignerAmino,
    });

    console.log("signedBody", signedBody)

    // Send request to API
    const response = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signedBody),
    });

    // Handle response
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`API error: ${response.statusText}`);
    }

    return response.status === 204 ? undefined : await response.json();
}

// Client-side code for sending files with metadata
async function uploadFilesToDao(
    wallet: OfflineSigner,
    hexPublicKey: string,
    address: string,
    daoId: string,
    keyOwner: string,
    filePaths: string[], // Paths to files for testing
) {
    try {
        // Read the files from disk
        const fileObjects = filePaths.map(filePath => {
            const fileName = path.basename(filePath);
            const fileContent = fs.readFileSync(filePath);
            const contentType = getContentType(fileName);
            const fileSize = fs.statSync(filePath).size;

            return {
                path: filePath,
                name: fileName,
                content: fileContent,
                contentType,
                size: fileSize
            };
        });

        // Create the metadata objects from the file information
        const fileMetadata = fileObjects.map(file => ({
            name: file.name,
            size: file.size,
            contentType: file.contentType,
        }));

        // Auth data needed for the request
        const authData = {
            type: "DAO DAO DNAS Profile | Use Key",
            nonce: await getNonce(API_BASE, hexPublicKey),
            chainId: "juno-1",
            chainFeeDenom: "ujuno",
            chainBech32Prefix: "juno",
            publicKeyType: "/cosmos.crypto.secp256k1.PubKey",
            publicKeyHex: hexPublicKey
        };

        // Create the request data
        const requestData = {
            dao: daoId,
            keyOwner: keyOwner,
            files: fileMetadata,
            auth: authData
        };

        // Sign the message
        const signedBody = await signOffChainAuth({
            type: authData.type,
            nonce: authData.nonce,
            chainId: authData.chainId,
            address,
            hexPublicKey,
            data: requestData,
            offlineSignerAmino: wallet as any,
        });

        console.log("Creating FormData for file upload...");

        // Create form data with both the signed message and actual files
        const formData = new FormData();
        console.log("Sending file upload request...");

        // Add the signed message as JSON
        formData.append('message', JSON.stringify(signedBody));

        // Add each file with a predictable key that the server can use
        fileObjects.forEach((file, index) => {
            console.log(`Adding file ${index}: ${file.name} (${file.size} bytes)`);
            formData.append(`file_${index}`, file.content, {
                filename: file.name,
                contentType: file.contentType
            });
        });



        // Send the request
        // First, send the signed message as JSON
        const messageResponse = await fetch(`${API_BASE}/use-dnas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signedBody),
        });

        if (!messageResponse.ok) {
            const errorText = await messageResponse.text();
            console.error(`Upload failed with status ${messageResponse.status}: ${errorText}`);
            throw new Error(`Upload failed: ${messageResponse.statusText}`);
        }

        const result = await messageResponse.json();
        console.log("Upload successful:", result);
        return result;

    } catch (error) {
        console.error("Error in uploadFilesToDao:", error);
        throw error;
    }
}

async function main() {
    try {
        const daoAddr = process.env.DAO_ID || 'juno17wvyfcmxe6paknzssj64kezgh2h6df6ez9e0wgwr65fvks2l6pmq52ev80'; // DAO ID from env or default
        const apiKeyValue = process.env.DNAS_API_KEY_VALUE || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdXRob3JpemVkIjp0cnVlLCJleHAiOjE3NzYwMTIwNzQsIm5hbWUiOiJ0ZXkiLCJ1c2VyIjoiYXV0aDB8NjdiZTcxYjE5ZmQ5MTA3ZmJjYmRjYjY5In0.IejPpB8H9m5E4ob8Q113V62IximYl_Uu-RQlULolBxI"; // API key from env or default

        // 0. Initialize wallets for testing
        const daoMember1Mnemonic = process.env.DAO_MEMBER1_MNEMONIC || "major garlic pulse siren arm identify all oval dumb tissue moral upon poverty erase judge either awkward metal antenna grid crack pioneer panther bullet"; // Replace with your test mnemonic
        const daoMember2Mnemonic = process.env.DAO_MEMBER2_MNEMONIC || "finish custom duty any destroy sibling zone brain legend fitness subject token high skirt festival define result vacant pepper vast element present direct bright"; // Replace with your test mnemonic

        const member1Wallet = await initializeWallet(daoMember1Mnemonic);
        const member2Wallet = await initializeWallet(daoMember2Mnemonic);

        const member1Accounts = await member1Wallet.getAccounts();
        const member2Accounts = await member2Wallet.getAccounts();

        const member1Address = member1Accounts[0].address;
        const member2Address = member2Accounts[0].address;

        console.log("Member 1 address:", member1Address);
        console.log("Member 2 address:", member2Address);

        // Connect clients
        const member1Client = await SigningCosmWasmClient.connectWithSigner(LOCAL_RPC, member1Wallet);
        const member2Client = await SigningCosmWasmClient.connectWithSigner(LOCAL_RPC, member2Wallet);
        const queryClient = await CosmWasmClient.connect(LOCAL_RPC);

        // Get public keys
        const member1Account = await member1Client.getAccount(member1Address);
        const member2Account = await member2Client.getAccount(member2Address);

        if (!member1Account?.pubkey || !member2Account?.pubkey) {
            throw new Error("Failed to get account public keys");
        }

        const member1HexPublicKey = toHex(fromBase64(member1Account.pubkey.value));
        const member2HexPublicKey = toHex(fromBase64(member2Account.pubkey.value));

        console.log("Member 1 public key:", member1HexPublicKey);
        console.log("Member 2 public key:", member2HexPublicKey);

        // Create auth object for the request
        let auth: Auth = {
            type: "DAO DAO DNAS Profile | Register Key",
            nonce: await getNonce(API_BASE, member1HexPublicKey),
            chainId: "juno-1",
            chainFeeDenom: "ujuno",
            chainBech32Prefix: "juno",
            publicKeyType: "/cosmos.crypto.secp256k1.PubKey",
            publicKeyHex: member1HexPublicKey
        };

        // Create DNAS key with necessary fields
        const dnasKey: ProfileDnasKeyWithValue = {
            id: 0, // Will be assigned by the server
            profileId: 0, // Will be assigned by the server
            type: "api_key",
            keyMetadata: "{}",
            signatureLifespan: "24h", // 24 hour lifespan
            uploadLimit: "1000000", // 1MB in bytes
            apiKeyValue: Buffer.from(apiKeyValue).toString("base64") // Example API key value
        };

        // Prepare the full register request
        const registerRequest: RegisterDnasKeyRequest = {
            dnasApiKeys: [
                {
                    data: {
                        auth,
                        dao: daoAddr,
                        dnas: dnasKey
                    },
                    signature: "" // Will be filled by signOffChainAuth
                }
            ]
        };

        // 1. Register DNAS key with dao-member-1 (create profile)
        console.log("\n1. Registering DNAS key for dao-member-1...");
        const registerResponse: RegisterDnasKeyResponse = await sendSignedRequest(
            API_BASE,
            "/register-dnas",
            member1Wallet,
            member1Address,
            member1HexPublicKey,
            registerRequest,
            "DAO DAO DNAS Profile | Register Key"
        );
        console.log("Register DNAS key response:", registerResponse);

        // 2. Query profile
        console.log("\n2. Querying profile for dao-member-1...");
        const response = await fetch(API_BASE + `/bech32/${member1Account?.address}`)
        const res: FetchedProfile = await response.json();
        console.log("Fetch profile response:", res);

        // 3. Upload test files
        console.log("\n3. Uploading test files with dao-member-1...");

        const testFilePaths = [
            path.join(__dirname, 'test-data', 'test-file1.txt'),
            path.join(__dirname, 'test-data', 'tomato.json'),
        ];

        // Upload files using the DAO member's credentials
        const uploadResponse = await uploadFilesToDao(
            member1Wallet,
            member1HexPublicKey,
            member1Address,
            daoAddr,
            member1Address,
            testFilePaths
        );

        console.log("File upload response:", uploadResponse);

        // 4. Query files to verify upload
        console.log("\n4. Querying files for dao-member-1...");
        // Add file query implementation if your API supports it

        console.log("\nAll tests completed successfully!");

    } catch (error) {
        console.error("Error in main:", error);
    }
}

// Helper function to determine content type based on file extension
function getContentType(fileName: string): string {
    const extension = path.extname(fileName).toLowerCase();
    const contentTypes: Record<string, string> = {
        '.txt': 'text/plain',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.xml': 'application/xml',
        '.zip': 'application/zip'
    };

    return contentTypes[extension] || 'application/octet-stream';
}

// Helper function to get nonce from API
async function getNonce(apiBase: string, hexPublicKey: string): Promise<number> {
    try {
        const nonceResponse = await fetch(`${apiBase}/nonce/${hexPublicKey}`);

        const data: { nonce: number } = await nonceResponse.json();

        if (!('nonce' in data)) {
            console.error('Failed to fetch nonce.', data, hexPublicKey);
            throw new Error('Failed to load nonce data');
        }
        if (typeof data.nonce !== 'number') {
            console.error('Failed to fetch nonce.', data, hexPublicKey);
            throw new Error('Failed to load nonce data');
        }

        return data.nonce;
    } catch (error) {
        console.error('Error fetching nonce:', error);
        throw error;
    }
}

export const signOffChainAuth = async <
    Data extends Record<string, unknown> | undefined = Record<string, any>
>({
    type,
    nonce,
    chainId,
    address,
    hexPublicKey,
    data,
    offlineSignerAmino,
    generateOnly = false,
}: SignatureOptions<Data>): Promise<SignedBody<Data>> => {

    const dataWithAuth: SignedBody<Data>['data'] = {
        ...data,
        auth: {
            type,
            nonce,
            chainId,
            chainFeeDenom: "ujuno", // getNativeTokenForChainId(chainId).denomOrAddress,
            chainBech32Prefix: "juno",
            publicKeyType: "/cosmos.crypto.secp256k1.PubKey",//  getPublicKeyTypeForChain(chainId),
            publicKeyHex: hexPublicKey,
            // Backwards compatible.
            publicKey: hexPublicKey,
        },
    }

    // Generate data to sign.
    const signDocAmino = makeSignDoc(
        [
            {
                type: dataWithAuth.auth.type,
                value: { signer: address, data: JSON.stringify(dataWithAuth, undefined, 2) },
            },
        ],
        {
            gas: '0',
            amount: [{ denom: dataWithAuth.auth.chainFeeDenom, amount: '0', },],
        },
        "juno-1",
        '',
        0,
        0
    )

    let signature = ''
    // Sign data.
    if (!generateOnly) {
        signature = (await offlineSignerAmino.signAmino(address, signDocAmino))
            .signature.signature
    }

    const signedBody: SignedBody<Data> = {
        data: dataWithAuth,
        signature,
    }

    return signedBody
}

main().catch(console.error);