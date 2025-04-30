import { fromBech32, toHex } from '@cosmjs/encoding'
import { Request, RouteHandler } from 'itty-router'

import { Env, FetchDaoKeysResponse, FetchedDaoKeys } from '../types'
import { getDnsApiKeysByDaoAddr } from '../utils'

export const fetchAllDaoKeys: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: FetchDaoKeysResponse) =>
    new Response(JSON.stringify(response), { status })

  // via address hex
  let addressHex = request.params?.addressHex?.trim()
  // via bech32 address
  const bech32Address = request.params?.bech32Address?.trim()

  let profileRow: FetchedDaoKeys | null = null
  try {
    // If no public key nor address hex is set, get address hex from bech32
    // address.
    if (!addressHex && bech32Address) {
      addressHex = toHex(fromBech32(bech32Address).data)
    }
    if (addressHex) {
      profileRow = await getDnsApiKeysByDaoAddr(env, addressHex)
    }
    // if (publicKey) {
    //     profileRow = await getDnsApiKeysByDao(env, publicKey)
    // } else if (addressHex) {
    // }
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // create array object of keys loaded by
  if (profileRow) {
    return respond(200, profileRow)
  } else {
    return respond(500, {
      error: 'Failed to retrieve profile:',
    })
  }
}
