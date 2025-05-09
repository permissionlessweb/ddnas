import { SHA256 } from 'crypto-js'

import { KnownError } from './error'
import { INITIAL_NONCE } from './nft'
import { PublicKeyBase, makePublicKey } from '../publicKeys'
import {
  DbRowProfile,
  DbRowProfileDnasApiKey,
  DbRowProfilePublicKey,
  DbRowProfilePublicKeyChainPreference,
  Env,
  FetchedDaoKeys,
  ProfileDnasKeyWithValue,
  PublicKey,
  PublicKeyJson,
  UpdateDnasKey,
  UpdateProfile,
} from '../types'

/**
 * Get the profile for a given name.
 */
export const getProfileFromName = async (
  env: Env,
  name: string
): Promise<DbRowProfile | null> =>
  await env.DB.prepare(
    `
    SELECT *
    FROM profiles
    WHERE name = ?1
    `
  )
    .bind(name)
    .first<DbRowProfile>()

/**
 * Get a profile by its ID.
 */
export const getProfileById = async (
  env: Env,
  profileId: number
): Promise<DbRowProfile | null> =>
  await env.DB.prepare(
    `
    SELECT *
    FROM profiles
    WHERE id = ?1
    `
  )
    .bind(profileId)
    .first<DbRowProfile>()

/**
 * Get the profile for a given public key.
 */
export const getProfileFromPublicKeyHex = async (
  env: Env,
  publicKeyHex: string
): Promise<(DbRowProfile & { publicKeyId: number }) | null> =>
  await env.DB.prepare(
    `
    SELECT profiles.*, profile_public_keys.id AS publicKeyId
    FROM profiles
    INNER JOIN profile_public_keys
    ON profiles.id = profile_public_keys.profileId
    WHERE profile_public_keys.publicKeyHex = ?1
    `
  )
    .bind(publicKeyHex)
    .first<DbRowProfile & { publicKeyId: number }>()

/**
 * Get the profile for a given address hex.
 */
export const getProfileFromAddressHex = async (
  env: Env,
  addressHex: string
): Promise<DbRowProfile | null> =>
  await env.DB.prepare(
    `
    SELECT profiles.*, profile_public_keys.id AS publicKeyId
    FROM profiles
    INNER JOIN profile_public_keys
    ON profiles.id = profile_public_keys.profileId
    WHERE profile_public_keys.addressHex = ?1
    `
  )
    .bind(addressHex)
    .first<DbRowProfile & { publicKeyId: number }>()

/**
 * Get the nonce for a given public key. If no profile exists for the public
 * key, return the default nonce.
 */
export const getNonce = async (
  env: Env,
  publicKeyHex: string
): Promise<number> => {
  const profile = await getProfileFromPublicKeyHex(env, publicKeyHex)
  return profile?.nonce || INITIAL_NONCE
}

/**
 * Get the public key hex for a given address hex.
 */
export const getPublicKeyHexForAddressHex = async (
  env: Env,
  addressHex: string
): Promise<string | undefined> => {
  const publicKeyRow = await env.DB.prepare(
    `
    SELECT publicKey
    FROM profile_public_keys
    WHERE addressHex = ?1
    `
  )
    .bind(addressHex)
    .first<DbRowProfilePublicKey>()

  return publicKeyRow?.publicKeyHex
}

/**
 * Get top 5 profiles by name prefix and each profiles' public key for a given
 * chain.
 */
export const getProfilesWithNamePrefix = async (
  env: Env,
  namePrefix: string,
  chainId: string
): Promise<
  (Pick<
    DbRowProfile,
    | 'id'
    | 'uuid'
    | 'name'
    | 'nftChainId'
    | 'nftCollectionAddress'
    | 'nftTokenId'
  > &
    Pick<DbRowProfilePublicKey, 'type' | 'publicKeyHex' | 'addressHex'>)[]
> =>
  (
    await env.DB.prepare(
      `
      SELECT profiles.id, profiles.uuid, profiles.name, profiles.nftChainId, profiles.nftCollectionAddress, profiles.nftTokenId, profile_public_keys.type, profile_public_keys.publicKeyHex, profile_public_keys.addressHex
      FROM profiles
      INNER JOIN profile_public_key_chain_preferences
      ON profiles.id = profile_public_key_chain_preferences.profileId
      INNER JOIN profile_public_keys
      ON profile_public_key_chain_preferences.profilePublicKeyId = profile_public_keys.id
      WHERE profiles.name LIKE ?1
      AND profile_public_key_chain_preferences.chainId = ?2
      ORDER BY name ASC
      LIMIT 5
      `
    )
      .bind(namePrefix + '%', chainId)
      .all<DbRowProfile & DbRowProfilePublicKey>()
  ).results ?? []

/**
 * Get the public key for a profile on a given chain.
 */
export const getPreferredProfilePublicKey = async (
  env: Env,
  profileId: number,
  chainId: string
): Promise<PublicKey | null> => {
  const row = await env.DB.prepare(
    `
    SELECT profile_public_keys.type AS type, profile_public_keys.publicKeyHex AS publicKeyHex
    FROM profile_public_keys
    INNER JOIN profile_public_key_chain_preferences
    ON profile_public_keys.id = profile_public_key_chain_preferences.profilePublicKeyId
    WHERE profile_public_key_chain_preferences.profileId = ?1
    AND profile_public_key_chain_preferences.chainId = ?2
    `
  )
    .bind(profileId, chainId)
    .first<Pick<DbRowProfilePublicKey, 'type' | 'publicKeyHex'>>()

  return row && makePublicKey(row.type, row.publicKeyHex)
}

/**
 * Get the dnas api keys for a profile.
 */
export const getProfileDnasApiKeys = async (
  env: Env,
  profileId: number
): Promise<
  {
    row: DbRowProfileDnasApiKey
  }[]
> =>
  (
    await env.DB.prepare(
      `
      SELECT *
      FROM dnas_api_keys
      WHERE profileId = ?1
      `
    )
      .bind(profileId)
      .all<DbRowProfileDnasApiKey>()
  ).results.map((row) => ({
    row,
  }))

/**
 * Get the public keys for a profile.
 */
export const getProfilePublicKeys = async (
  env: Env,
  profileId: number
): Promise<
  {
    publicKey: PublicKey
    row: DbRowProfilePublicKey
  }[]
> =>
  (
    await env.DB.prepare(
      `
      SELECT *
      FROM profile_public_keys
      WHERE profileId = ?1
      `
    )
      .bind(profileId)
      .all<DbRowProfilePublicKey>()
  ).results.map((row) => ({
    publicKey: makePublicKey(row.type, row.publicKeyHex),
    row,
  }))

/**
 * Get the api key & metadata for for each dao preference set on a profile.
 */
/**
 * Get the api key & metadata for each dao address
 */
export const getDnsApiKeysByDaoAddrHex = async (
  env: Env,
  daoAddr: string
): Promise<FetchedDaoKeys> => {
  const rows = (
    await env.DB.prepare(
      `
      SELECT 
        profileId,
        keyMetadata,
        uploadLimit,
        apiKeyHash,
        chainId,
        daoAddr
      FROM dnas_api_keys
      WHERE daoAddr = ?1
      `
    )
      .bind(daoAddr)
      .all<{
        profileId: number
        keyMetadata: string
        uploadLimit?: string
        apiKeyHash: Buffer // Notice the type is Buffer for VARBINARY
        chainId: string
        daoAddr: string
      }>()
  ).results

  console

  const res = await processProfileDnasRows(env, rows)
  return res
}

/**
 * Get the public key & metadata for for each chain preference set on a profile.
 */
export const getProfilePublicKeyPerChain = async (
  env: Env,
  profileId: number
): Promise<
  {
    chainId: string
    publicKey: PublicKey
  }[]
> => {
  const rows = (
    await env.DB.prepare(
      `
      SELECT profile_public_key_chain_preferences.chainId AS chainId, profile_public_keys.type as type, profile_public_keys.publicKeyHex AS publicKeyHex
      FROM profile_public_key_chain_preferences
      INNER JOIN profile_public_keys
      ON profile_public_key_chain_preferences.profilePublicKeyId = profile_public_keys.id
      WHERE profile_public_key_chain_preferences.profileId = ?1
      `
    )
      .bind(profileId)
      .all<
        Pick<DbRowProfilePublicKeyChainPreference, 'chainId'> &
          Pick<DbRowProfilePublicKey, 'type' | 'publicKeyHex'>
      >()
  ).results

  return rows.map(({ chainId, type, publicKeyHex }) => ({
    chainId,
    publicKey: makePublicKey(type, publicKeyHex),
  }))
}

/**
 * Save dnas keys.
 */
export const saveDnasKeys = async (
  env: Env,
  publicKey: PublicKey,
  dnasKey: UpdateDnasKey,
  existingProfileId: number
): Promise<DbRowProfileDnasApiKey | null> => {
  let updatedDnasKeyRow: DbRowProfileDnasApiKey | null

  const existingProfile = await getProfileDnasApiKeys(env, existingProfileId)

  // if dnas key is empty, remove existing key from db by dao addr
  if (existingProfile) {
    // return the existing informationaboutnt the key updated
    if (!dnasKey.dnasKey && dnasKey.daoAddr) {
      await removeDnasProfileApiKeys(env, existingProfileId, [dnasKey.daoAddr])
      return null
    } else {
      updatedDnasKeyRow = await env.DB.prepare(
        `
        INSERT INTO dnas_api_keys (
          profileId, 
          type, 
          keyMetadata,
          uploadLimit,
          apiKeyHash,
          chainId,
          daoAddr
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (profileId, chainId, daoAddr)
          DO UPDATE SET
          type = $2,
          keyMetadata = $3,
          uploadLimit = $4,
          apiKeyHash = $5,
          updatedAt = CURRENT_TIMESTAMP
          WHERE dnas_api_keys.apiKeyHash != $5  // Only update if hash changes
          RETURNING *
          `
      )
        .bind(
          existingProfileId,
          publicKey.type,
          dnasKey.dnasKey?.keyMetadata || JSON.stringify({}),
          dnasKey.dnasKey?.uploadLimit || null,
          dnasKey.dnasKey?.apiKeyValue, // should exist as empty triggers removal of key from dao
          dnasKey.chainId,
          dnasKey.daoAddr
        )
        .first<DbRowProfileDnasApiKey>()
      return updatedDnasKeyRow
    }
  }
  //  do nothing if no existing profile
  return null
}

/**
 * Save profile.
 */
export const saveProfile = async (
  env: Env,
  publicKey: PublicKey,
  profile: UpdateProfile,
  // Optionally set chain preferences for this public key.
  chainIds?: string[]
): Promise<DbRowProfile> => {
  const existingProfile = await getProfileFromPublicKeyHex(env, publicKey.hex)

  let updatedProfileRow: DbRowProfile | null
  let profilePublicKeyId = existingProfile?.publicKeyId

  // If profile exists, update.
  if (existingProfile) {
    updatedProfileRow = await env.DB.prepare(
      `
      UPDATE profiles
      SET nonce = ?1, name = ?2, nftChainId = ?3, nftCollectionAddress = ?4, nftTokenId = ?5, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?6
      RETURNING *
      `
    )
      .bind(
        profile.nonce,
        profile.name,
        profile.nft?.chainId ?? null,
        profile.nft?.collectionAddress ?? null,
        profile.nft?.tokenId ?? null,
        existingProfile.id
      )
      .first<DbRowProfile>()
  }
  // Otherwise, create.
  else {
    updatedProfileRow = await env.DB.prepare(
      `
      INSERT INTO profiles (uuid, nonce, name, nftChainId, nftCollectionAddress, nftTokenId)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      RETURNING *
      `
    )
      .bind(
        crypto.randomUUID(),
        profile.nonce,
        profile.name,
        profile.nft?.chainId ?? null,
        profile.nft?.collectionAddress ?? null,
        profile.nft?.tokenId ?? null
      )
      .first<DbRowProfile>()
    if (!updatedProfileRow) {
      throw new KnownError(500, 'Failed to save profile.')
    }

    const profilePublicKeyRow = await env.DB.prepare(
      `
      INSERT INTO profile_public_keys (profileId, type, publicKeyHex, addressHex)
      VALUES (?1, ?2, ?3, ?4)
      RETURNING *
      `
    )
      .bind(
        updatedProfileRow.id,
        publicKey.type,
        publicKey.hex,
        publicKey.addressHex
      )
      .first<DbRowProfilePublicKey>()
    if (!profilePublicKeyRow) {
      throw new KnownError(500, 'Failed to save profile public key.')
    }

    profilePublicKeyId = profilePublicKeyRow.id
  }

  if (!updatedProfileRow) {
    throw new Error('Failed to update profile.')
  }

  // Set chain preferences for this public key if specified.
  if (chainIds && profilePublicKeyId !== undefined) {
    await setProfileChainPreferences(
      env,
      updatedProfileRow.id,
      profilePublicKeyId,
      chainIds
    )
  }

  return updatedProfileRow
}

/**
 * Increment profile nonce.
 */
export const incrementProfileNonce = async (
  env: Env,
  profileId: number
): Promise<void> => {
  await env.DB.prepare(
    `
    UPDATE profiles
    SET nonce = nonce + 1, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?1
    `
  )
    .bind(profileId)
    .run()
}

/**
 * Add public key to profile and/or optionally update the profile's preferences
 * for the given chains to this public key.
 */
export const addProfilePublicKey = async (
  env: Env,
  profileId: number,
  publicKey: PublicKey,
  chainIds?: string[]
) => {
  // Get profile this public key is currently attached to.
  const currentProfile = await getProfileFromPublicKeyHex(env, publicKey.hex)

  // If attached to a different profile already, remove it.
  if (currentProfile && currentProfile.id !== profileId) {
    // Remove the public key from its current profile.
    await removeProfilePublicKeys(env, currentProfile.id, [publicKey])
  }

  const profilePublicKeyRow =
    // If not attached to the current profile, attach it.
    !currentProfile || currentProfile.id !== profileId
      ? await env.DB.prepare(
          `
          INSERT INTO profile_public_keys (profileId, type, publicKeyHex, addressHex)
          VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT DO NOTHING
          RETURNING id
          `
        )
          .bind(profileId, publicKey.type, publicKey.hex, publicKey.addressHex)
          .first<Pick<DbRowProfilePublicKey, 'id'>>()
      : // Otherwise just find the existing public key.
        await env.DB.prepare(
          `
          SELECT id
          FROM profile_public_keys
          WHERE type = ?1 AND publicKeyHex = ?2
          `
        )
          .bind(publicKey.type, publicKey.hex)
          .first<Pick<DbRowProfilePublicKey, 'id'>>()
  if (!profilePublicKeyRow) {
    throw new KnownError(500, 'Failed to save or retrieve profile public key.')
  }

  // Set chain preferences for this public key if specified.
  if (chainIds) {
    await setProfileChainPreferences(
      env,
      profileId,
      profilePublicKeyRow.id,
      chainIds
    )
  }
}

/**
 * Add dnaapi key to profile and/or optionally update the profile's preferences
 * for the given daos to this public key.
 */

export const addDnsProfileApiKey = async (
  env: Env,
  profileId: number,
  publicKey: PublicKey,
  apiKey: ProfileDnasKeyWithValue,
  compositeKey: string[]
) => {
  try {
    // Get the current profile attached to the public key
    const currentProfile = await getProfileFromPublicKeyHex(env, publicKey.hex)

    // If the api key is attached to a different profile, remove it
    if (currentProfile && currentProfile.id !== profileId) {
      await removeDnasProfileApiKeys(env, currentProfile.id, compositeKey)
    }

    // For each DAO, create/update the DNAS API key entry
    for (const dao of compositeKey) {
      const [chainId, daoAddr] = dao.split(':')

      if (!chainId || !daoAddr) {
        throw new KnownError(
          400,
          `Invalid DAO format: ${dao}. Expected "chainId:daoAddr".`
        )
      }

      // hash of raw api key
      const apiKeyHash = SHA256(apiKey.apiKeyValue)
      // base64 encode key just to not store raw bytes
      const base64EncodedApiKey = Buffer.from(
        apiKey.apiKeyValue,
        'utf8'
      ).toString('base64')
      // console.log('DEBUG BASE64 ENCODING API KEY:', apiKeyHash)
      // console.log('base64EncodedApiKey:', base64EncodedApiKey)

      // Insert new DNAS API key record
      const dnasApiKeyRow = await env.DB.prepare(
        `
        INSERT INTO dnas_api_keys (
          profileId, 
          type, 
          keyMetadata,
          uploadLimit,
          apiKeyHash,
          chainId,
          daoAddr
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (profileId, chainId, daoAddr) 
        DO UPDATE SET
          type = $2,
          keyMetadata = $3,
          uploadLimit = $4,
          apiKeyHash = $5,
          updatedAt = CURRENT_TIMESTAMP
        RETURNING id
      `
      )
        .bind(
          profileId,
          publicKey.type,
          apiKey.keyMetadata || JSON.stringify({}),
          apiKey.uploadLimit || null,
          apiKeyHash.toString(),
          chainId,
          daoAddr
        )
        .first<{ id: number }>()

      if (!dnasApiKeyRow) {
        throw new KnownError(500, `Failed to save DNAS API key for DAO: ${dao}`)
      }

      // Insert the API key into api_keys table
      // The trigger will handle updating the apiKeyHash in dnas_api_keys
      const apiKeyRow = await env.DB.prepare(
        `
        INSERT INTO api_keys (
          dnasKeyId, 
          apiKeyValue
        )
        VALUES ($1, $2)
        ON CONFLICT (dnasKeyId) 
        DO UPDATE SET
          apiKeyValue = $2,
          updatedAt = CURRENT_TIMESTAMP
        RETURNING id
      `
      )
        .bind(dnasApiKeyRow.id, base64EncodedApiKey)
        .first<{ id: number }>()

      if (!apiKeyRow) {
        throw new KnownError(500, `Failed to save API key for DAO: ${dao}`)
      }
    }

    return true
  } catch (error) {
    console.error('Error adding DNAS profile API key:', error)

    if (error instanceof KnownError) {
      throw error
    }

    throw new KnownError(500, 'Failed to add DNAS profile API key.', error)
  }
}

/**
 * Set chain preferences for a given public key.
 */
const setProfileChainPreferences = async (
  env: Env,
  profileId: number,
  publicKeyRowId: number,
  chainIds: string[]
): Promise<void> => {
  // Insert or update chain preferences.
  await env.DB.batch(
    chainIds.map((chainId) =>
      env.DB.prepare(
        `
        INSERT INTO profile_public_key_chain_preferences (profileId, chainId, profilePublicKeyId)
        VALUES (?1, ?2, ?3)
        ON CONFLICT (profileId, chainId)
        DO UPDATE SET profilePublicKeyId = ?3, updatedAt = CURRENT_TIMESTAMP
        `
      ).bind(profileId, chainId, publicKeyRowId)
    )
  )
}
/**
 * Set a default dao for a chain to default to use the key requested for it key assigned to it.
 *
 * First dnas api key registered as default,
 */
// const setChainDaoPreference = async (
//   env: Env,
//   profileId: number,
//   dnasApiKeyRowId: number,
//   dao: string[]
// ): Promise<void> => {
//   // Insert or update chain preferences.
//   await env.DB.batch(
//     chainIds.map((chainId) =>
//       env.DB.prepare(
//         `
//         INSERT INTO profile_public_key_chain_preferences (profileId, chainId, profilePublicKeyId)
//         VALUES (?1, ?2, ?3)
//         ON CONFLICT (profileId, chainId)
//         DO UPDATE SET profilePublicKeyId = ?3, updatedAt = CURRENT_TIMESTAMP
//         `
//       ).bind(profileId, chainId, dnasApiKeyRowId)
//     )
//   )
// }

/**
 * Remove public keys from profile. If all public keys are removed, delete the
 * entire profile.
 */
export const removeProfilePublicKeys = async (
  env: Env,
  profileId: number,
  publicKeys: PublicKeyJson[]
) => {
  // Get all public keys attached to the profile.
  const publicKeyRows = await getProfilePublicKeys(env, profileId)

  // If removing all public keys, delete the entire profile, since no public
  // keys will have access to it anymore and thus we need to free up the name.
  if (
    publicKeyRows.every(({ publicKey }) =>
      publicKeys.some((key) => PublicKeyBase.publicKeysEqual(publicKey, key))
    )
  ) {
    // Delete cascades to public keys and chain preferences.
    await env.DB.prepare(
      `
      DELETE FROM profiles
      WHERE id = ?1
      `
    )
      .bind(profileId)
      .run()
    return
  }

  // Otherwise remove just these public keys.
  const publicKeyRowsToDelete = publicKeys.flatMap(
    (key) =>
      publicKeyRows.find(({ publicKey }) =>
        PublicKeyBase.publicKeysEqual(publicKey, key)
      ) || []
  )
  await env.DB.batch(
    publicKeyRowsToDelete.map(({ row: { id } }) =>
      // Delete cascades to chain preferences.
      env.DB.prepare(
        `
        DELETE FROM profile_public_keys
        WHERE id = ?1
        `
      ).bind(id)
    )
  )
}

/**
 * Remove api keys from profile. clears any db entry of this key usage from dao members.
 *  If all api keys are removed, delete the entire profile.
 */
export const removeDnasProfileApiKeys = async (
  env: Env,
  profileId: number,
  daos: string[]
) => {
  // Get all api key rows attached to the profile.
  const dnasApiKeyRows: {
    row: DbRowProfileDnasApiKey
  }[] = await getProfileDnasApiKeys(env, profileId)

  // Otherwise remove just these daos dnas api keys.
  const dnasApiKeyRowsToDelete = daos.flatMap(
    (key) =>
      dnasApiKeyRows.find(
        ({ row }) =>
          // todo:use key id value to remove from db
          key === row.daoAddr
      ) || []
  )
  await env.DB.batch(
    dnasApiKeyRowsToDelete.map(({ row: { id } }) =>
      // Delete cascades to chain preferences.
      env.DB.prepare(
        `
        DELETE FROM dnas_api_keys
        WHERE id = ?1
        `
      ).bind(id)
    )
  )
}

/**
 * Gets the actual API key value for a given DNAS API key ID
 *
 * @param env Database environment
 * @param dnasApiKeyId The ID of the DNAS API key from dnas_api_keys table
 * @returns The API key value or null if not found
 */
export const getDnasApiKeyValue = async (
  env: Env,
  dnasApiKeyId: number
): Promise<string | null> => {
  try {
    // Query the api_keys table to get the actual API key value
    const apiKeyRow = await env.DB.prepare(
      `
      SELECT apiKeyValue
      FROM api_keys
      WHERE dnasKeyId = $1
      ORDER BY updatedAt DESC
      LIMIT 1
    `
    )
      .bind(dnasApiKeyId)
      .first<{ apiKeyValue: string }>()

    if (!apiKeyRow) {
      // console.log(`No API key found for DNAS API key ID: ${dnasApiKeyId}`)
      return null
    }

    // decode the base64 key to return the raw api key value
    const rawKey = Buffer.from(apiKeyRow.apiKeyValue, 'base64').toString(
      'utf-8'
    )
    return rawKey
  } catch (error) {
    console.error(
      `Error retrieving API key for DNAS API key ID ${dnasApiKeyId}:`,
      error
    )
    throw new KnownError(500, 'Failed to retrieve API key value.', error)
  }
}

async function processProfileDnasRows(
  env: Env,
  rows: {
    profileId: number
    keyMetadata: string
    uploadLimit?: string
    apiKeyHash: Buffer
    chainId: string
    daoAddr: string
  }[]
) {
  const fetchedKeys: FetchedDaoKeys = {}

  // console.log('rows', rows)
  // Process each row sequentially with await
  for (const row of rows) {
    // Convert apiKeyHash to a hexadecimal string if needed
    const keyHash = row.apiKeyHash.toString()
    const compositeKey = `${row.chainId}_${row.daoAddr}`

    // Now we can properly await this function
    const keyOwner = await getProfilePublicKeys(env, row.profileId)

    // Ensure all required fields are strings
    fetchedKeys[compositeKey] = {
      chainId: String(row.chainId),
      keyOwner: keyOwner[0].publicKey.hex,
      apiKeyHash: keyHash,
      keyMetadata: String(row.keyMetadata),
      // Only add uploadLimit if it exists, and ensure it's a string
      ...(row.uploadLimit !== undefined && row.uploadLimit !== null
        ? { uploadLimit: String(row.uploadLimit) }
        : {}),
    }
  }
  // console.log('fetchedKeys:', fetchedKeys)
  return fetchedKeys
}
