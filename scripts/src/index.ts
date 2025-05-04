import * as fs from 'fs'
import path from 'node:path'

import { Secp256k1HdWallet, StdSignature, makeSignDoc } from '@cosmjs/amino'
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { fromBase64, fromBech32, toHex } from '@cosmjs/encoding'
import { OfflineSigner } from '@cosmjs/proto-signing'
import {
  Auth,
  FetchedProfile,
  SignMessageParams,
  SignatureOptions,
  SignedBody,
} from 'dnas/src/types'
import dotenv from 'dotenv'

dotenv.config()

// API and RPC configuration
const LOCAL_RPC = process.env.LOCAL_RPC || 'https://juno-rpc.polkachu.com:443'
const API_BASE = process.env.API_BASE || 'http://localhost:58229' // Your local API server endpoint
const chainFeeDenom = 'ujuno'
const chainBech32Prefix = 'juno'
const chainId = 'juno-1'
const publicKeyType = '/cosmos.crypto.secp256k1.PubKey'

// Helper function to initialize wallet from mnemonic
async function initializeWallet(mnemonic: string): Promise<OfflineSigner> {
  const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: 'juno', // Change to your chain's prefix if needed
  })
  return wallet as OfflineSigner
}

async function main() {
  try {
    const daoAddr =
      process.env.DAO_ID ||
      'juno17wvyfcmxe6paknzssj64kezgh2h6df6ez9e0wgwr65fvks2l6pmq52ev80' // DAO ID from env or default
    const apiKeyValue = process.env.DNAS_API_KEY_VALUE || '' // API key from env or default

    // 0. Initialize wallets for testing
    const daoMember1Mnemonic =
      process.env.DAO_MEMBER1_MNEMONIC ||
      'major garlic pulse siren arm identify all oval dumb tissue moral upon poverty erase judge either awkward metal antenna grid crack pioneer panther bullet'
      const daoMember2Mnemonic =
      process.env.DAO_MEMBER2_MNEMONIC ||
      'finish custom duty any destroy sibling zone brain legend fitness subject token high skirt festival define result vacant pepper vast element present direct bright'
      const notMemberMnemonic =
        process.env.DAO_MEMBER1_MNEMONIC ||
        'unhappy token earn risk cushion dance robot filter task october giggle funny'

    const member1Wallet = await initializeWallet(daoMember1Mnemonic)
    const member2Wallet = await initializeWallet(daoMember2Mnemonic)
    const notMemberWallet = await initializeWallet(daoMember1Mnemonic)

    const member1Accounts = await member1Wallet.getAccounts()
    const member2Accounts = await member2Wallet.getAccounts()

    const member1Address = member1Accounts[0].address
    const member2Address = member2Accounts[0].address

    console.log('Member 1 address:', member1Address)
    console.log('Member 2 address:', member2Address)

    // Connect clients
    const member1Client = await SigningCosmWasmClient.connectWithSigner(
      LOCAL_RPC,
      member1Wallet
    )
    const member2Client = await SigningCosmWasmClient.connectWithSigner(
      LOCAL_RPC,
      member2Wallet
    )
    // const queryClient = await CosmWasmClient.connect(LOCAL_RPC)

    // Get public keys
    const member1Account = await member1Client.getAccount(member1Address)
    const member2Account = await member2Client.getAccount(member2Address)

    if (!member1Account?.pubkey || !member2Account?.pubkey) {
      throw new Error('Failed to get account public keys')
    }

    const member1HexPublicKey = toHex(fromBase64(member1Account.pubkey.value))
    const member2HexPublicKey = toHex(fromBase64(member2Account.pubkey.value))

    console.log('Member 1 public key:', member1HexPublicKey)
    console.log('Member 2 public key:', member2HexPublicKey)

    // // 1. Register profile (public key) for both dao members
    const profile1Response = await registerProfile(
      member1Wallet,
      member1Address,
      member1HexPublicKey
    )
    const profile2Response = await registerProfile(
      member2Wallet,
      member2Address,
      member2HexPublicKey
    )
    // console.log('Register profile 1 response:', profile1Response)
    // console.log('Register profile 1 response:', profile2Response)

    //  Save DNAS key to DAO for member 1
    registerDnas(
      member1Wallet,
      member1HexPublicKey,
      member1Address,
      daoAddr,
      apiKeyValue
    )

    //  2. Get fetch saved profile for profile id
    // console.log('\n2. Querying profiles via public key hex...')
    let response1 = await fetch(API_BASE + `/${member1HexPublicKey}`)
    let response2 = await fetch(API_BASE + `/${member2HexPublicKey}`)
    let fetchedProfile1: FetchedProfile = await response1.json()
    let fetchedProfile2: FetchedProfile = await response2.json()
    if (JSON.stringify(fetchedProfile1) === JSON.stringify(fetchedProfile2)) {
      throw new Error('Fetched profiles via bech32 address are the same')
    }

    // console.log('\n2.1 Querying profiles via bech32 address...')
    response1 = await fetch(API_BASE + `/address/${member1Address}`)
    response2 = await await fetch(API_BASE + `/address/${member2Address}`)
    fetchedProfile1 = await response1.json()
    fetchedProfile2 = await response2.json()
    if (JSON.stringify(fetchedProfile1) === JSON.stringify(fetchedProfile2)) {
      throw new Error('Fetched profiles via public key hex are the same')
    }

    // console.log('\n2.2 Querying profiles via bech32 address...')
    response1 = await fetch(
      API_BASE + `/bech32/${toHex(fromBech32(member1Address).data)}`
    )
    response2 = await fetch(
      API_BASE + `/bech32/${toHex(fromBech32(member2Address).data)}`
    )
    fetchedProfile1 = await response1.json()
    fetchedProfile2 = await response2.json()
    if (JSON.stringify(fetchedProfile1) === JSON.stringify(fetchedProfile2)) {
      throw new Error('Fetched profiles via public key hex are the same')
    }

    // assert these are different from each other ^
    // console.log('\n2.3 Querying profiles via bech32 address...')
    response1 = await fetch(
      API_BASE + `/hex/${toHex(fromBech32(member1Address).data)}`
    )
    response2 = await fetch(
      API_BASE + `/hex/${toHex(fromBech32(member2Address).data)}`
    )
    fetchedProfile1 = await response1.json()
    fetchedProfile2 = await response2.json()
    if (JSON.stringify(fetchedProfile1) === JSON.stringify(fetchedProfile2)) {
      throw new Error('Fetched profiles via hex are the same')
    }

    //  2. Get fetch saved profile for profile id
    // console.log('\n2. Querying profile for dao-member-1...')
    let daoRes = await fetch(
      API_BASE + `/daoKeys/bech32/${toHex(fromBech32(daoAddr).data)}`
    )
    // console.log(daoRes)

    // // 7. Upload test files
    // console.log('\n4. Uploading test files with dao-member-1...')

    const testFilePaths = [
      path.join(__dirname, 'test-data', 'test-file1.txt'),
      path.join(__dirname, 'test-data', 'tomato.json'),
    ]

    // // Upload files using the DAO member's credentials
    const uploadResponse = await uploadFilesToDao(
      member1Wallet,
      member1HexPublicKey,
      member1Address,
      daoAddr,
      member1Address,
      testFilePaths
    )

    // console.log('File upload response:', uploadResponse)

    // 8. Query files to verify upload
    // console.log('\n5. Querying files for dao-member-1...')
    // Add file query implementation if your API supports it

    // // 3. Create auth object for the DNAS key request
    // auth = createAuth(
    //     "DAO DAO DNAS Profile | UnRegister Dnas Key",
    //     await getNonce(API_BASE, member1HexPublicKey),
    //     member1HexPublicKey
    // );
    // // Create the main unregister request data
    // const mainUnregisterRequestData = {
    //     auth: auth,
    //     daos: [daoAddr]
    // };

    // // Sign the main request using signOffChainAuth
    // const unregisterRequest = await signOffChainAuth({
    //     type: auth.type,
    //     nonce: auth.nonce,
    //     chainId: auth.chainId,
    //     address: member1Address,
    //     hexPublicKey: member1HexPublicKey,
    //     data: mainUnregisterRequestData,
    //     offlineSignerAmino: member1Wallet as any,
    // });

    // // 9. remove api key from dnas worker
    // const removeDnasApiKey = await fetch(`${API_BASE}/unregister-dnas`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(unregisterRequest),
    // });
    // // console.log("Dnas Key registration response:", removeDnasApiKey);

    // console.log('\nAll tests completed successfully!')
  } catch (error) {
    console.error('Error in main:', error)
  }
}

// New function to register a profile (public key)
async function registerProfile(
  wallet: OfflineSigner,
  address: string,
  hexPublicKey: string
) {
  try {
    // Get offline signer for amino
    const offlineSignerAmino = wallet as any
    if (!offlineSignerAmino || !('signAmino' in offlineSignerAmino)) {
      throw new Error('Wallet does not support amino signing')
    }

    // Get nonce from API
    const nonce = await getNonce(API_BASE, hexPublicKey)

    // Create public key auth
    const publicKeyAuth = createAuth(
      'DAO DAO DNAS Profile | Register Profile',
      nonce,
      hexPublicKey
    )

    // Create the public key data structure
    const publicKeyData = {
      data: {
        allow: publicKeyAuth.publicKeyHex,
        chainIds: [chainId],
        auth: publicKeyAuth,
      },
      signature: '', // Will be filled later
    }

    // Sign the inner public key data first
    const messageToSign = {
      type: publicKeyAuth.type,
      nonce: publicKeyAuth.nonce,
      chain_id: publicKeyAuth.chainId,
      address,
      public_key: hexPublicKey,
      data: publicKeyData.data,
    }

    // Sign the message for public key
    const { signature } = await signMessageAmino({
      offlineSignerAmino,
      address,
      chainId,
      messageToSign,
    })

    // Assign the signature to the public key data
    publicKeyData.signature = signature.signature

    // Prepare the request structure for public key registration
    const publicKeyRequestData = {
      publicKeys: [publicKeyData],
    }

    // Now sign the entire request
    const signedBody = await signOffChainAuth({
      type: publicKeyAuth.type,
      nonce: publicKeyAuth.nonce,
      chainId: publicKeyAuth.chainId,
      address,
      hexPublicKey,
      data: publicKeyRequestData,
      offlineSignerAmino,
    })

    // // console.log('Sending profile registration request...')
    // // console.log('Request payload:', JSON.stringify(signedBody, null, 2))

    // Send request to API
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedBody),
    })

    // Handle response
    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `Profile registration failed with status ${response.status}: ${errorText}`
      )
      throw new Error(`API error: ${response.status} - ${response.statusText}`)
    }

    return response.status === 204 ? { success: true } : await response.json()
  } catch (error) {
    console.error('Error in registerProfile:', error)
    throw error
  }
}

async function registerDnas(
  memberWallet: OfflineSigner,
  hexPublicKey: string,
  bech32Addr: string,
  daoAddr: string,
  apiKeyValue: string
) {
  // 1. Create the main auth object
  const auth = createAuth(
    'DAO DAO DNAS Profile | Register Dnas Key',
    await getNonce(API_BASE, hexPublicKey),
    hexPublicKey
  )

  // Create the public key data structure. we chose here to only sign the main auth body.
  const dnasKeyData = {
    dao: daoAddr,
    dnas: {
      type: 'api_key',
      keyMetadata: '{}',
      uploadLimit: '1000000',
      apiKeyValue: Buffer.from(apiKeyValue).toString('base64'),
    },
  }

  // Prepare the request structure for public key registration
  const publicKeyRequestData = {
    keys: [dnasKeyData],
  }
  // 6. Sign the main request
  const signedBody = await signOffChainAuth({
    type: auth.type,
    nonce: auth.nonce,
    chainId: auth.chainId,
    address: bech32Addr,
    hexPublicKey: hexPublicKey,
    data: publicKeyRequestData,
    offlineSignerAmino: memberWallet as any,
  })

  console.log('Sending DNAS registration request...', signedBody)

  const registerResponse = await fetch(`${API_BASE}/register-dnas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedBody),
  })

  if (!registerResponse.ok) {
    const errorText = await registerResponse.text()
    console.error(
      `DNAS key registration failed with status ${registerResponse.status}: ${errorText}`
    )
    throw new Error(
      `API error: ${registerResponse.status} - ${registerResponse.statusText}`
    )
  }

  const registerResult = await registerResponse.json()
  // console.log('Register DNAS key response:', registerResult)
}

// Helper function to determine content type based on file extension
function getContentType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase()
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
    '.zip': 'application/zip',
  }

  return contentTypes[extension] || 'application/octet-stream'
}

// Client-side code for sending files with metadata
async function uploadFilesToDao(
  wallet: OfflineSigner,
  hexPublicKey: string,
  address: string,
  daoId: string,
  keyOwner: string,
  filePaths: string[] // Paths to files for testing
) {
  try {
    // Read the files from disk
    const fileObjects = filePaths.map((filePath) => {
      const fileName = path.basename(filePath)
      const fileContent = fs.readFileSync(filePath)
      const contentType = getContentType(fileName)
      const fileSize = fs.statSync(filePath).size

      const blob = new Blob([fileContent], {
        type: getContentType(fileName),
      })

      return {
        path: filePath,
        name: fileName,
        blob: blob,
        contentType,
        size: fileSize,
      }
    })

    // Create the metadata objects from the file information
    // const fileMetadata = fileObjects.map((file) => ({
    //   name: file.name,
    //   size: file.size,
    //   contentType: file.contentType,
    // }))

    // Auth data needed for the request
    const authData = {
      type: 'DAO DAO DNAS Profile | Use Key',
      nonce: await getNonce(API_BASE, hexPublicKey),
      chainId: 'juno-1',
      chainFeeDenom,
      chainBech32Prefix,
      publicKeyType: '/cosmos.crypto.secp256k1.PubKey',
      publicKeyHex: hexPublicKey,
    }

    // create the custom auth object ()
    const requestData = {
      dao: daoId,
      keyOwner: keyOwner,
      // files: fileMetadata,
      auth: authData,
    }

    // Sign the message
    const signedBody = await signOffChainAuth({
      type: authData.type,
      nonce: authData.nonce,
      chainId: authData.chainId,
      address,
      hexPublicKey,
      data: requestData,
      offlineSignerAmino: wallet as any,
    })

    // console.log('Creating FormData for file upload...')

    // Create form data with both the signed message and actual files
    const formData = new FormData()
    // console.log('Sending file upload request...')

    // Add the signed message as JSON
    formData.append('auth_message', JSON.stringify(signedBody))

    // Add each file with a predictable key
    fileObjects.forEach((file, index) => {
      // Make sure file.content is an actual File or Blob object
      formData.append(`file_${index}`, file.blob)
    })

    // console.log('formData', formData)

    // Send the request
    // First, send the signed message as JSON
    const messageResponse = await fetch(`${API_BASE}/use-dnas`, {
      method: 'POST',
      body: formData,
    })

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text()
      console.error(
        `Upload failed with status ${messageResponse.status}: ${errorText}`
      )
      throw new Error(`Upload failed: ${messageResponse.statusText}`)
    }

    const result = await messageResponse.json()
    // console.log('Upload successful:', result)
    return result
  } catch (error) {
    console.error('Error in uploadFilesToDao:', error)
    throw error
  }
}

// Helper function to get nonce from API
async function getNonce(
  apiBase: string,
  hexPublicKey: string
): Promise<number> {
  try {
    const nonceResponse = await fetch(`${apiBase}/nonce/${hexPublicKey}`)

    const data: { nonce: number } = await nonceResponse.json()

    if (!('nonce' in data)) {
      console.error('Failed to fetch nonce.', data, hexPublicKey)
      throw new Error('Failed to load nonce data')
    }
    if (typeof data.nonce !== 'number') {
      console.error('Failed to fetch nonce.', data, hexPublicKey)
      throw new Error('Failed to load nonce data')
    }

    return data.nonce
  } catch (error) {
    console.error('Error fetching nonce:', error)
    throw error
  }
}

export const signOffChainAuth = async <
  Data extends Record<string, unknown> | undefined = Record<string, any>,
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
      chainFeeDenom,
      chainBech32Prefix,
      publicKeyType: '/cosmos.crypto.secp256k1.PubKey', //  getPublicKeyTypeForChain(chainId),
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
        value: {
          signer: address,
          data: JSON.stringify(dataWithAuth, undefined, 2),
        },
      },
    ],
    {
      gas: '0',
      amount: [{ denom: dataWithAuth.auth.chainFeeDenom, amount: '0' }],
    },
    chainId,
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

/**
 * Signs a message using amino encoding
 * @param params - Parameters required for signing
 * @returns Promise containing the signature
 */
async function signMessageAmino({
  offlineSignerAmino,
  address,
  chainId,
  messageToSign,
}: SignMessageParams): Promise<{ signature: StdSignature }> {
  try {
    const { signature } = await offlineSignerAmino.signAmino(address, {
      chain_id: chainId,
      account_number: '0',
      sequence: '0',
      fee: { amount: [], gas: '0' },
      msgs: [
        {
          type: 'sign/MsgSignData',
          value: {
            signer: address,
            data: Buffer.from(JSON.stringify(messageToSign)).toString('base64'),
          },
        },
      ],
      memo: '',
    })

    return { signature }
  } catch (error) {
    throw new Error(`Failed to sign message: ${error}`)
  }
}

/**
 * Creates an auth object with the specified nonce and public key hex
 * @param nonce The nonce value for the request
 * @param publicKeyHex The hexadecimal representation of the public key
 * @returns An auth object with the required properties
 */
function createAuth(type: string, nonce: number, publicKeyHex: string): Auth {
  return {
    type,
    nonce,
    chainId,
    chainFeeDenom,
    chainBech32Prefix,
    publicKeyType,
    publicKeyHex,
  }
}

main().catch(console.error)
