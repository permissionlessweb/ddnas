import { fromBase64, SecretNetworkClient, toBase64, toUtf8, TxResponse, Wallet } from "secretjs";
import { PublicKeyJson } from "../types";
import { sha256 } from "@cosmjs/crypto";
import { makeSignDoc, serializeSignDoc, StdSignDoc } from "@cosmjs/amino";
import { createSecretClient } from "../chains/secret";

// Body of message adr-036 signed by api middleware
export type RegisterDnasApiEntrypoint = {
  api_key_hash: string,
  authentication: {
    dnas_auth: {
      msg: string
      sig: string
    }
    member_auth: {
      msg: string
      sig: string
    }
  }
}

export interface DnasAction {
  daoAddr: string;
  chainId: string;
  base64EncodedApiKey: string;
  mwAuth: DefaultAuth;
  dmAuth: DefaultAuth;
}

export type DefaultDnasMetadata = {
  /// middleware `secret1`addr able to request authentication msgs
  middlewareOpAddr: string
  /// storage contract api key owner authroized
  scrtDnasAddr: string
}

// Body encoded by middleware logic to sign & pass to contract.
export type MiddlewareAuthData = {
  dao_addr: string
  dm_bech32_addr: string
  nonce: number
}

export type MiddlewareAuthObjectTransient = MiddlewareAuthData & {
  dmAuth: DefaultAuth,
  compositeKey: string,
  signMsgDocs: StdSignDoc,
}

// Interfaces matching the contract's schema
interface PubkeyObject {
  ty: string;
  value: string;
}

export interface DefaultAuth {
  msg: string;
  sig: string;
  pubkey: PubkeyObject;
}

interface DnasAuth {
  mw_auth: DefaultAuth;
  dm_auth: DefaultAuth;
}

interface DnasKeyObject {
  api_key_value: string;
  authentication: DnasAuth;
}

interface MiddlewareUseRequestData {
  dao_member: string;
  dao_addr: string;
  msg_hash: string;
  nonce: number;
}



export interface RegisterDnasKey {
  mwAuthObj: MiddlewareAuthData;
  dmPubkey: string;
  mwOp: Wallet;
  dmMsg: string;
  dmSig: string;
}


// Function to sign and query the contract
export async function executeRegisterToScrtDnasKey(
  wallet: Wallet,
  data: DnasAction[]
): Promise<TxResponse> {
  const client = createSecretClient();

  // iterate through each and generate offline tx, 
  const actions: DefaultAuth[] = [];
  // condense all 


  // Prepare middleware message
  let dnas: DnasKeyObject[] = data.map((action) => {
    let dnasKeyObject: DnasKeyObject = {
      api_key_value: action.base64EncodedApiKey,
      authentication: {
        mw_auth: action.mwAuth,
        dm_auth: action.dmAuth,
      }
    }
    return dnasKeyObject
  })

  // Construct the execute message
  const executeMsg: { register_dnas_api: { dnas: DnasKeyObject[] } } = { register_dnas_api: { dnas }, };

  return await client.tx.compute.executeContract(
    {
      sender: wallet.address,
      contract_address: process.env.DNAS_CONTRACT_ADDRESS!,
      msg: executeMsg,
    },
    {
      gasLimit: 200000, // Adjust gas limit as needed
    }
  );
}

// Function to sign and query the contract
export async function queryDnasApiEntrypoint(
  client: SecretNetworkClient,
  wallet: Wallet,
  data: RegisterDnasKey,
  metadata: DefaultDnasMetadata,
  // memberMsg: MemberUseDnasRequestData,
): Promise<Uint8Array> {



  const memberMsgHash = sha256(toUtf8(data.dmMsg));

  // Prepare middleware message
  const middlewareMsg: MiddlewareUseRequestData = {
    nonce: data.mwAuthObj.nonce,
    dao_member: data.mwAuthObj.dm_bech32_addr,
    msg_hash: toBase64(memberMsgHash),
    dao_addr: data.mwAuthObj.dao_addr,
  };


  const middlewareSignDoc = makeSignDoc(
    [
      {
        type: 'MIDDLEWARE_DNAS_KEY_REQUEST',
        value: {
          signer: wallet.publicKey,
          data: toBase64(Buffer.from(JSON.stringify(middlewareMsg))),
        },
      },
    ],
    {
      gas: '0',
      amount: [
        {
          denom: 'uscrt',
          amount: '0',
        },
      ],
    },
    'secret-4',
    '',
    0,
    0
  )

  const signature = await wallet.signAmino(wallet.address, middlewareSignDoc)

  // Construct the authentication object
  const auth: DnasAuth = {
    mw_auth: {
      msg: JSON.stringify(signature.signed),
      sig: signature.signature.signature,
      pubkey: {
        ty: signature.signature.pub_key.type,
        value: toBase64(signature.signature.pub_key.value),
      },
    },
    dm_auth: {
      msg: data.dmMsg,
      sig: data.dmSig,
      pubkey: {
        ty: "secp256k1",
        value: data.dmPubkey,
      },
    },
  };


  // Construct the query message
  const queryMsg: { dnas_api_entrypoint: { req: DnasAuth } } = { dnas_api_entrypoint: { req: auth } };

  // Execute thebase64 encoded raw bytes of the binary 
  const response: Uint8Array = await client.query.compute.queryContract({ contract_address: metadata.scrtDnasAddr, query: queryMsg });
  return response;
}
