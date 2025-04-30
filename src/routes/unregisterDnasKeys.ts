import {
  AuthorizedRequest,
  DbRowProfile,
  Env,
  UnregisterDnasKeyResponse,
  UnregisterDnasKeysRequest,
} from '../types'
import {
  KnownError,
  getProfileFromPublicKeyHex,
  incrementProfileNonce,
  removeDnasProfileApiKeys,
} from '../utils'

export const unregisterDnasKeys = async (
  {
    parsedBody: {
      data: { auth, daos },
    },
    publicKey,
  }: AuthorizedRequest<UnregisterDnasKeysRequest>,
  env: Env
) => {
  const respond = (status: number, response: UnregisterDnasKeyResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  // Get existing profile.
  let profile: DbRowProfile | null
  try {
    profile = await getProfileFromPublicKeyHex(env, publicKey.hex)
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve existing profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  if (!profile) {
    return respond(404, {
      error: 'Profile not found.',
    })
  }

  // todo: assert dao keys exists

  // Validate nonce to prevent replay attacks.
  if (auth.nonce !== profile.nonce) {
    return respond(401, {
      error: `Invalid nonce. Expected: ${profile.nonce}`,
    })
  }

  // Increment nonce to prevent replay attacks.
  try {
    await incrementProfileNonce(env, profile.id)
  } catch (err) {
    console.error('Profile nonce increment', err)

    return respond(500, {
      error:
        'Failed to increment profile nonce: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // Remove dnas keys from profile.
  try {
    await removeDnasProfileApiKeys(env, profile.id, daos)
  } catch (err) {
    console.error('Remove dnas pi key error:', err)

    if (err instanceof KnownError) {
      return respond(err.statusCode, err.responseJson)
    }

    return respond(500, {
      error:
        'Failed to remove profile dnas api keys: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  return respond(200, { success: true })
}
