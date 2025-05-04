import { fromBech32, toHex } from '@cosmjs/encoding'
import { Request, RouteHandler } from 'itty-router'

import { Env, FetchDaoKeysResponse, FetchedDaoKeys } from '../types'
import { getDnsApiKeysByDaoAddrHex } from '../utils'

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
  // // console.log("addressHex", addressHex)
  // // console.log("bech32Address", bech32Address)

  let daoKeys: FetchedDaoKeys | null = null
  try {
    // If no public key nor address hex is set, get address hex from bech32
    // address.
    if (!addressHex && bech32Address) {
      addressHex = toHex(fromBech32(bech32Address).data)
    }
    if (addressHex) {
      daoKeys = await getDnsApiKeysByDaoAddrHex(env, addressHex)
    }
    // // console.log("daoKeys:", daoKeys)
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // create array object of keys loaded by
  if (daoKeys) {
    return respond(200, daoKeys)
  } else {
    return respond(500, {
      error: 'Failed to retrieve profile:',
    })
  }
}
