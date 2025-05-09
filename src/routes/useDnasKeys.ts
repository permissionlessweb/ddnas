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
  getProfileFromPublicKeyHex,
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
  console.log('Received formData:', formData)

  let signedBodyString = formData.get('sign')?.toString()
  if (!signedBodyString) {
    return new Response(
      'Missing auth context indexed with "sign" in form data',
      { status: 400 }
    )
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
      error: `${signer} is not member of DAO: ${custom.dao}`,
    })
  }

  const addressHex = custom.keyOwner
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
      key.row.daoAddr === custom.dao
  )

  if (!thisDnasApi) {
    return respond(500, {
      error: 'Dao member has no dnas api key for this DAO.',
    })
  }

  // get the actual api key
  let rawApiKey = await getDnasApiKeyValue(env, thisDnasApi.row.id)
  if (!rawApiKey) {
    return respond(500, {
      error: 'Unable to resolve rawApiKey.',
    })
  }

  try {
    // Create a new FormData for the outgoing request
    const outgoingForm = new FormData()
    // console.log('formData:', formData)

    // Process all form entries
    let fileCount = 0
    for (const value of formData.getAll('files')) {
      if (Array.isArray(value)) {
        value.forEach((file) => {
          outgoingForm.append('files', file)
          fileCount++
          // console.log(`Adding file: ${file.name} as "files"`)
        })
      } else {
        outgoingForm.append('files', value)
        fileCount++
        // console.log(`Adding single file as "files"`)
      }
    }

    // If no files were found in the form, return an error
    if (fileCount === 0) {
      return respond(400, {
        error:
          'No files found in the request. Please include at least one file.',
      })
    }

    // Log what we're actually sending
    // console.log(`Sending ${fileCount} files to Jackal API`)
    // Encode the API key for authorization header
    // console.log(`DEBUG ENCODED KEY:`, rawApiKey)

    // Prepare request options
    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${rawApiKey}`,
      },
      body: outgoingForm as any,
    }

    // Make the request to Jackal API
    const response = await fetch(jackalApiUploadMultipleFileBase, options)

    if (response.ok) {
      const resJson = await response.json()
      const res = resJson as JackalSuccessResponse[]
      return respond(200, {
        data: res.map((file) => ({
          success: true,
          cid: file.cid,
          id: file.id,
          merkle: file.merkle,
          name: file.name,
        })),
      })
    } else {
      const resErrJson = await response.json()
      const res = resErrJson as JackalErrorResponse
      return respond(response.status, {
        success: false,
        error: JSON.stringify({
          code: response.status,
          message: res.message,
          details: `HTTP ${response.status}: ${res.message}`,
        }),
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
