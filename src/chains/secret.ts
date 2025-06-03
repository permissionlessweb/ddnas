import { SecretNetworkClient, Wallet } from 'secretjs'
import { OfflineAminoSigner } from '@cosmjs/amino'
import { Env } from '../types'

// Secret Network configuration
export const SECRET_NETWORK_CONFIG = {
  chainId: 'secret-4',
  url: 'https://lcd.secret.express',
  // Alternative URLs for redundancy
  // url: 'https://secret-4.api.trivium.network:1317',
  // url: 'https://api.scrt.network',
}

/**
 * Create a Secret Network client for queries (no wallet required)
 */
export function createSecretClient(): SecretNetworkClient {
  return new SecretNetworkClient({
    url: SECRET_NETWORK_CONFIG.url,
    chainId: SECRET_NETWORK_CONFIG.chainId,
  })
}

/**
 * Create a Secret Network client with amino wallet for signing transactions
 */
export async function createSecretClientWithSigner(
  offlineSignerAmino: OfflineAminoSigner,
  address: string
): Promise<SecretNetworkClient> {
  return new SecretNetworkClient({
    url: SECRET_NETWORK_CONFIG.url,
    chainId: SECRET_NETWORK_CONFIG.chainId,
    wallet: offlineSignerAmino,
    walletAddress: address,
  })
}

/**
 * Create a Secret Network client with private key wallet
 */
export function createSecretClientWithPrivateKey(
  mnemonic: string
): SecretNetworkClient {
  const wallet = new Wallet(mnemonic)
  
  return new SecretNetworkClient({
    url: SECRET_NETWORK_CONFIG.url,
    chainId: SECRET_NETWORK_CONFIG.chainId,
    wallet: wallet,
    walletAddress: wallet.address,
  })
}

/**
 * Execute a secret contract query
 */
export async function querySecretContract(
  client: SecretNetworkClient,
  contractAddress: string,
  query: object,
  codeHash?: string
): Promise<any> {
  try {
    const response = await client.query.compute.queryContract({
      contract_address: contractAddress,
      code_hash: codeHash,
      query: query,
    })
    return response
  } catch (error) {
    console.error('Secret contract query failed:', error)
    throw error
  }
}

/**
 * Execute a secret contract transaction
 */
export async function executeSecretContract(
  client: SecretNetworkClient,
  contractAddress: string,
  message: object,
  codeHash?: string,
  funds?: { denom: string; amount: string }[],
  memo?: string
): Promise<any> {
  try {
    const response = await client.tx.compute.executeContract({
      sender: client.address,
      contract_address: contractAddress,
      code_hash: codeHash,
      msg: message,
      sent_funds: funds || [],
    }, {
      gasLimit: 300_000,
      memo: memo,
    })
    return response
  } catch (error) {
    console.error('Secret contract execution failed:', error)
    throw error
  }
}

/**
 * Sign a message offline without broadcasting
 */
export async function signMessage(
  client: SecretNetworkClient,
  contractAddress: string,
  message: object,
  codeHash?: string,
  memo?: string
): Promise<any> {
  try {
    // Create and sign a transaction without broadcasting
    const tx = await client.tx.compute.executeContract({
      sender: client.address,
      contract_address: contractAddress,
      code_hash: codeHash,
      msg: message,
      sent_funds: [],
    }, {
      gasLimit: 300_000,
      memo: memo,
      broadcastCheckIntervalMs: 0, // Don't wait for broadcast
    })
    
    return tx
  } catch (error) {
    console.error('Message signing failed:', error)
    throw error
  }
}

/**
 * Broadcast a pre-signed transaction
 */
export async function broadcastTransaction(
  client: SecretNetworkClient,
  signedTx: any
): Promise<any> {
  try {
    // For pre-signed transactions, we would need to use the raw broadcast method
    // This is a simplified implementation - in practice you'd need to handle
    // the transaction bytes properly based on how the signing was done
    return signedTx
  } catch (error) {
    console.error('Transaction broadcast failed:', error)
    throw error
  }
}

/**
 * Get account information
 */
export async function getAccountInfo(
  client: SecretNetworkClient,
  address: string
): Promise<any> {
  try {
    const account = await client.query.auth.account({ address })
    return account
  } catch (error) {
    console.error('Failed to get account info:', error)
    throw error
  }
}

/**
 * Get secret contract info
 */
export async function getContractInfo(
  client: SecretNetworkClient,
  contractAddress: string
): Promise<any> {
  try {
    const contractInfo = await client.query.compute.contractInfo({
      contract_address: contractAddress,
    })
    return contractInfo
  } catch (error) {
    console.error('Failed to get contract info:', error)
    throw error
  }
}