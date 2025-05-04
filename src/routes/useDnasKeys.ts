import { fromBech32, toHex } from '@cosmjs/encoding'
import { FormData } from 'undici'
import { Buffer } from 'node:buffer'

import { makePublicKey } from '../publicKeys'
import {
  CustomAuthorizedRequest,
  Env,
  RequestBody,
  UseDnasKeyRequest,
} from '../types'
import {
  getDnasApiKeyValue,
  getProfileDnasApiKeys,
  getProfileFromAddressHex,
  getProfileFromPublicKeyHex,
  respond,
  verifyRequestBodyAndGetPublicKey,
} from '../utils'
import { getIsDaoMember } from '../utils/dao'
import { JackalErrorResponse, JackalSuccessResponse } from '../utils/jackal'

// Define the File interface if it doesn't exist in the environment
interface FileObject {
  name: string;
  type: string;
  size: number;
}

const jackalApiCreateCollectionBase =
  'https://pinapi.jackalprotocol.com/api/collections/test21233'
const jackalApiUploadFileBase = 'https://pinapi.jackalprotocol.com/api/files'
const jackalApiUploadMultipleFileBase =
  'https://pinapi.jackalprotocol.com/api/v1/files'
const jackalApiAddFileToCollection =
  'https://pinapi.jackalprotocol.com/api/files'

export const useDnasKeys = async (
  request: CustomAuthorizedRequest<UseDnasKeyRequest>,
  env: Env
) => {
  // Grab form data from request
  const formData: FormData = await request.formData?.()
  if (!formData) {
    return new Response('Missing form data', { status: 400 })
  }
  console.log('Received formData:', formData)

  let signedBodyString = formData.get('sign')?.toString()
  if (!signedBodyString) {
    return new Response('Missing auth context indexed with "sign" in form data', { status: 400 })
  }
  // console.log('authmsg:', signedBodyString)

  // Parse the signed body string into a RequestBody object
  let parsedBody: RequestBody
  try {
    parsedBody = JSON.parse(signedBodyString)
  } catch (e) {
    console.error('Failed to parse auth_message as JSON:', e)
    return new Response('Invalid auth_message format', { status: 400 })
  }
  // Now verify the parsed RequestBody and get the public key
  const publicKey = await verifyRequestBodyAndGetPublicKey(parsedBody)

  // Validate signature and extract public key
  if (!publicKey) {
    return new Response('Invalid Public Key', { status: 401 })
  }
  // console.log('publicKeyformed to be verified:', publicKey)

  const custom = parsedBody.data
  // Validate public key.
  const dnasChainpublicKey = makePublicKey(
    custom.auth.publicKeyType,
    custom.auth.publicKeyHex
  )

  const signer = dnasChainpublicKey.getBech32Address(
    custom.auth.chainBech32Prefix
  )
  // console.log('signer', signer)

  const daoMember = await getIsDaoMember(
    custom.auth.chainId,
    signer,
    custom.dao
  )
  if (!daoMember) {
    return respond(500, {
      error: `${signer} is not member of DAO`,
    })
  }

  // get profile for keyOwner requested (expected to already be hex string from decoded bech32 address)
  const addressHex = custom.keyOwner// toHex(fromBech32(custom.keyOwner).data)
  console.log(addressHex)

  const profile = await getProfileFromPublicKeyHex(env, addressHex)
  if (!profile) {
    return respond(500, {
      error: 'Dao member has not registered a profile for Dnas support.',
    })
  }

  const profileDnasApiKeys = await getProfileDnasApiKeys(env, profile.id)

  // - key owner has registered a key to this dao
  const thisDnasApi = profileDnasApiKeys.find(
    (key) =>
      key.row.chainId === custom.auth.chainId &&
      // key.row.apiKeyHash === custom.sign.data.keyHash &&
      key.row.daoAddr === toHex(fromBech32(custom.dao).data)
  )

  if (!thisDnasApi) {
    return respond(500, {
      error: 'Dao member has no dnas api key for this DAO.',
    })
  }

  // get the actual api key
  let apiKey = await getDnasApiKeyValue(env, thisDnasApi.row.id)
  if (!apiKey) {
    return respond(500, {
      error: 'Unable to resolve apiKey.',
    })
  }
  console.log('THIS DAO SPECIFIC DNAS API KEY FOUND:', apiKey)

  try {
    // Create a new FormData for the outgoing request
    const outgoingForm = new FormData()
    let fileCount = 0

    // Process all form entries and check if they're files
    for (const [key, value] of Object.entries(formData)) {
      // Skip the sign key since it contains the auth data
      if (key === 'sign') continue;
      
      // Check if we're dealing with a file-like object
      if (value && typeof value === 'object' && 'name' in value && 'type' in value) {
        // For files, Jackal API expects the key "files"
        outgoingForm.append("files", value)
        fileCount++
        console.log(`Adding file: ${key}, name: ${(value as any).name}, as "files"`)
      } else if (typeof value === 'string') {
        // Add string values to the form as well
        outgoingForm.append(key, value)
        console.log(`Adding string value for key: ${key}`)
      } else {
        // For other types, try to stringify them
        try {
          outgoingForm.append(key, JSON.stringify(value))
          console.log(`Adding JSON stringified value for key: ${key}`)
        } catch (e) {
          console.error(`Could not process form value for key '${key}':`, e)
        }
      }
    }

    // If no files were found in the form, return an error
    if (fileCount === 0) {
      return respond(400, {
        error: 'No files found in the request. Please include at least one file.',
      })
    }

    // Log what we're actually sending
    console.log(`Sending ${fileCount} files to Jackal API`)

    // Encode the API key for authorization header
    const encodedApiKey = Buffer.from(apiKey, 'base64').toString('utf-8')
    
    // Prepare request options
    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${encodedApiKey}`,
      },
      // Use outgoingForm as the body but cast it as any to work around TypeScript issue
      body: outgoingForm as any,
    }
    
    // Make the request to Jackal API
    const response = await fetch(jackalApiUploadMultipleFileBase, options)

    if (response.ok) {
      const res: JackalSuccessResponse = await response.json()
      console.log(res)
      return respond(200, {
        success: true,
        cid: res.cid,
        type: res.fileType,
        id: res.fileId,
      })
    } else {
      const res: JackalErrorResponse = await response.json()
      return respond(500, {
        error: `Error id: ${response.status}: ${res.message}`,
      })
    }
    // 200 == success
    // 401 == unauthoirzed
    // 413 == file too large, key limit reached
  } catch (err) {
    console.error(err)
    return respond(500, {
      error: `Network error: ${err}`,
    })
  }
}

// JACKAL  API
//todo: and file is within params set by key owner.

// upload multiple files
// const form = new FormData();
// form.append("files", "[\n  null\n]");

// const options = {
//   method: 'POST',
//   headers: {Authorization: 'Bearer <token>', 'Content-Type': 'multipart/form-data'}
// };

// options.body = form;

// fetch('', options)
//   .then(response => response.json())
//   .then(response => // console.log(response))
//   .catch(err => console.error(err));

// create new collection
// const options = {method: 'POST', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{name}', options)
//   .then(response => response.json())
//   .then(response => // console.log(response))
//   .catch(err => console.error(err));

// upload multiple files
// const form = new FormData();
// form.append("files", "[\n  null\n]");

// const options = {
//   method: 'POST',
//   headers: {Authorization: 'Bearer <token>', 'Content-Type': 'multipart/form-data'}
// };

// options.body = form;

// fetch('https://pinapi.jackalprotocol.com/api/v1/files', options)
//   .then(response => response.json())
//   .then(response => // console.log(response))
//   .catch(err => console.error(err));

// add file to collection
// const options = {method: 'PUT', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{id}/{fileid}', options)
//   .then(response => response.json())
//   .then(response => // console.log(response))
//   .catch(err => console.error(err));

// add collection to collection
// const options = {method: 'PUT', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{id}/c/{collectionid}', options)
//   .then(response => response.json())
//   .then(response => // console.log(response))
//   .catch(err => console.error(err));7
