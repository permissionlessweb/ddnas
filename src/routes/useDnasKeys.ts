import { fromBech32, toHex } from '@cosmjs/encoding'

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
  respond,
  verifyRequestBodyAndGetPublicKey,
} from '../utils'
import { getIsDaoMember } from '../utils/dao'
import { JackalErrorResponse, JackalSuccessResponse } from '../utils/jackal'

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
  // console.log('Received formData:', formData)

  let signedBodyString = formData.get('auth_message')?.toString()
  if (!signedBodyString) {
    return new Response('Missing auth_message in form data', { status: 400 })
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
  const addressHex = toHex(fromBech32(custom.keyOwner).data)

  const profile = await getProfileFromAddressHex(env, addressHex)
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
  // console.log('THIS DAO SPECIFIC DNAS API KEY FOUND', thisDnasApi)

  // get the actual api key
  let apiKey = await getDnasApiKeyValue(env, thisDnasApi.row.id)
  if (!apiKey) {
    return respond(500, {
      error: 'Unable to resolve apiKey.',
    })
  }

  try {
    // Create a new FormData for the outgoing request
    const outgoingForm = new FormData()

    for (const [key, value] of formData.entries()) {
      // Check if the key starts with 'file_'
      if (key.startsWith('file_')) {
        // Check if the value is a File
        if (value instanceof File) {
          outgoingForm.append(key, value)
        } else {
          // If not a File, you might want to handle this case
          console.error(`Value for key '${key}' is not a File.`)
        }
      }
    }

    // Log what we're actually sending
    for (const [key, value] of outgoingForm.entries()) {
      // console.log(`FormData entry: ${key}=${value}`)
    }
    // @ts-ignore: FormData has forEach in browsers but might not be recognized in your environment
    const encodedApiKey = Buffer.from(apiKey, 'base64').toString('utf-8')
    // console.log(encodedApiKey)
    // Better error handling with async/await
    const options: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${encodedApiKey}`,
      },
      body: outgoingForm, // Include the FormData as the request body
    }
    // console.log('got this far, we are hitting the jackal api...')
    const response = await fetch(jackalApiUploadMultipleFileBase, options)
    if (response.ok) {
      const res: JackalSuccessResponse = await response.json()
      // console.log(res)
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
