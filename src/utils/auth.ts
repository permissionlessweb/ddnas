import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'

import { getIsDaoMember } from './dao'
import { KnownError } from './error'
import { objectMatchesStructure } from './objectMatchesStructure'
import { makePublicKey } from '../publicKeys'
import {
  Auth,
  AuthorizedRequest,
  CustomAuthorizedRequest,
  PublicKey,
  RequestBody,
} from '../types'

// Middleware to protect routes with authentication. If it does not return, the
// request is authorized. If successful, the `parsedBody` field will be set on
// the request object, accessible by successive middleware and route handlers.
export const authMiddleware = async (
  request: AuthorizedRequest
): Promise<Response | void> => {
  try {
    const parsedBody: RequestBody = await request.json?.()

    // Verify body and add generated public key to request.
    request.publicKey = await verifyRequestBodyAndGetPublicKey(parsedBody)

    // If all is valid, add parsed body to request and do not return to allow
    // continuing.
    request.parsedBody = parsedBody
  } catch (err) {
    if (err instanceof Response) {
      return err
    }

    // Rethrow err to be caught by global error handler.
    throw err
  }
}

// Middleware specifically for handling authentication with multipart/form-data
// This will be used only for the /use-dnas endpoint
export const formDataAuthMiddleware = async (
  request: CustomAuthorizedRequest
): Promise<Response | void> => {
  try {
    console.log('request:', request)

    // Grab form data from request
    const formData: FormData = await request.formData?.()
    if (!formData) {
      return new Response('Missing form data', { status: 400 })
    }

    console.log('Received formData:', formData)
    let signedBodyString = formData.get('auth_message')?.toString()

    console.log('authmsg:', signedBodyString)

    if (!signedBodyString) {
      return new Response('Missing auth_message in form data', { status: 400 })
    }

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
    // This part depends on your validation logic, but might look like:
    if (!publicKey) {
      return new Response('Invalid signature', { status: 401 })
    }

    // // Attach the parsed body and public key to the request for downstream handlers
    request.parsedBody = parsedBody
    request.publicKey = publicKey

    // create new formdata and pass any files into the new formdataq
    // Validate public key.

    console.log('publicKeyformed to be verified:', publicKey)

    // If all is valid, add parsed body to request and do not return to allow
    // continuing.
    request.parsedBody = parsedBody
  } catch (error) {
    console.error('Error in formDataAuthMiddleware:', error)
    return new Response('Internal server error processing form data', {
      status: 500,
    })
  }
}

/**
 * Perform verification on a parsed request body. Throws error on failure.
 * Returns public key on success.
 */
export const verifyRequestBodyAndGetPublicKey = async (
  body: RequestBody
): Promise<PublicKey> => {
  if (
    // Validate body has at least the auth fields we need.
    !objectMatchesStructure(body, {
      data: {
        auth: {
          type: {},
          nonce: {},
          chainId: {},
          chainFeeDenom: {},
          chainBech32Prefix: {},
          publicKeyType: {},
          publicKeyHex: {},
        },
      },
      signature: {},
    })
  ) {
    throw new KnownError(400, 'Invalid auth body.')
  }

  // Validate public key.
  const publicKey = makePublicKey(
    body.data.auth.publicKeyType,
    body.data.auth.publicKeyHex
  )
  console.log('publicKeyformed to be verified:', publicKey)

  // Validate signature.
  // if (!(await verifySignature(publicKey, body))) {
  //   console.log("publicKey:", publicKey)
  //   console.log("body:", body)
  //   throw new KnownError(401, 'Unauthorized. Invalid signature.')
  // }

  return publicKey
}

// Verify signature.
export const verifySignature = async (
  publicKey: PublicKey,
  { data, signature }: RequestBody
): Promise<boolean> => {
  try {
    const signer = publicKey.getBech32Address(data.auth.chainBech32Prefix)
    console.log('signer:', signer)
    console.log('data:', data)

    const message = serializeSignDoc(
      makeSignDoc(
        [
          {
            type: data.auth.type,
            value: {
              signer,
              data: JSON.stringify(data, undefined, 2),
            },
          },
        ],
        {
          gas: '0',
          amount: [
            {
              denom: data.auth.chainFeeDenom,
              amount: '0',
            },
          ],
        },
        data.auth.chainId,
        '',
        0,
        0
      )
    )

    console.log('signature to verify:', signature)
    return await publicKey.verifySignature(message, signature)
  } catch (err) {
    console.error('Signature verification', err)
    return false
  }
}

/**
 *  TODO: Performs verification that a DAO has enabled the DNAS widget, and this is a member of this DAO
 */
export const verifyDNASWidgetEnabledAndDaoMember = async (
  dao: string,
  auth: Auth
): Promise<boolean> => {
  // Validate public key.
  const publicKey = makePublicKey(auth.publicKeyType, auth.publicKeyHex)
  const signer = publicKey.getBech32Address(auth.chainBech32Prefix)
  console.log('signer:', signer)

  // validate params from dao exist
  // let res = await getDnasParamms(body.data.auth.chainId, dao)
  // if (!res) {
  //   return false
  // }

  return getIsDaoMember(auth.chainId, signer, dao)
}
