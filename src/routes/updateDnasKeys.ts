import {
  AuthorizedRequest,
  Env,
  UpdateDnasKey,
  UpdateDnasKeysRequest,
  UpdateProfileResponse,
} from '../types'
import {
  getProfileDnasApiKeys,
  getProfileFromPublicKeyHex,
  removeDnasProfileApiKeys,
  saveDnasKeys,
} from '../utils'

const ALLOWED_NAME_CHARS = /^[a-zA-Z0-9._]+$/

export const updateDnasKeys = async (
  {
    parsedBody: { data: requestBody },
    publicKey,
  }: AuthorizedRequest<UpdateDnasKeysRequest>,
  env: Env
) => {
  const respond = (status: number, response: UpdateProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  try {
    // Validate body.
    if (!requestBody) {
      throw new Error('Missing.')
    }
    if (!('profile' in requestBody) || !requestBody.profile) {
      throw new Error('Missing profile.')
    }
    if (
      !('nonce' in requestBody.dnas) ||
      typeof requestBody.dnas.nonce !== 'number'
    ) {
      throw new Error('Missing profile.nonce.')
    }

    // Only validate dnasKey properties if truthy, since it can be set to null to clear it.
    if (
      'dnasKey' in requestBody.dnas &&
      requestBody.dnas.dnasKey &&
      (!('daoAddr' in requestBody.dnas.dnasKey) ||
        !requestBody.dnas.dnasKey.daoAddr ||
        !('nonce' in requestBody.dnas.dnasKey) ||
        typeof requestBody.dnas.dnasKey.nonce !== 'number')
    ) {
      throw new Error('dnasKey requires daoAddr and numeric nonce')
    }
  } catch (err) {
    console.error('Parsing request body', err)

    return respond(400, {
      error: err instanceof Error ? err.message : `${err}`,
    })
  }

  // Get existing profile. Initialize with defaults in case no profile found.
  let existingProfileId: number | undefined
  let dnasKey: UpdateDnasKey = {
    nonce: 0,
    chainId: '',
    daoAddr: '',
    dnasKey: null,
  }
  let daosToRemove: string[] = []

  try {
    const profileRow = await getProfileFromPublicKeyHex(env, publicKey.hex)
    if (profileRow) {
      existingProfileId = profileRow.id
      let profileDnasKeys = await getProfileDnasApiKeys(env, existingProfileId)
      if (profileDnasKeys) {
        // find all keys being updated if any and prepare msg accordingly
        let keysToUpdate = requestBody.dnas.map((a) => {
          return profileDnasKeys.find((pdk) => {
            if (pdk.row && pdk.row.daoAddr === a.daoAddr) {
              // check if we are removing key (api key value will be empty)
              // if we are , remove from db.
              // if we are not, update db with value
            }
          })
        })
        removeDnasProfileApiKeys(env, profileRow.id, daosToRemove)
      }
    }
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve existing profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // Validate nonce to prevent replay attacks.
  if (requestBody.dnas.nonce !== dnasKey.nonce) {
    return respond(401, {
      error: `Invalid nonce. Expected: ${dnasKey.nonce}`,
    })
  }

  // Validate dnasApiKey update request
  // const { d, nft } = requestBody.dnas

  // Increment nonce to prevent replay attacks.
  dnasKey.nonce++

  // Save.
  try {
    await saveDnasKeys(
      env,
      publicKey,
      dnasKey,
      existingProfileId ? existingProfileId : 0
    )
  } catch (err) {
    console.error('Profile save', err)

    return respond(500, {
      error:
        'Failed to save profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  return respond(200, { success: true })
}
