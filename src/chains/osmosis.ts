import { GetOwnedNftImageUrlFunction } from "../types";
import { secp256k1PublicKeyToBech32Address, KnownError } from "../utils";
import { getOwnedNftImageUrl as makeCw721GetOwnedNftImageUrl } from "./cw721";

const OSMOSIS_INDEXER = "https://indexer.daodao.zone/osmosis-1";
const OSMOSIS_RPC = "https://rpc.osmosis.zone";
const OSMOSIS_PREFIX = "osmo";

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  env,
  publicKey,
  collectionAddress,
  tokenId
) => {
  let address;
  try {
    address = secp256k1PublicKeyToBech32Address(publicKey, OSMOSIS_PREFIX);
  } catch (err) {
    console.error("PK to Address", err);
    throw new KnownError(400, "Invalid public key", err);
  }

  return await makeCw721GetOwnedNftImageUrl(
    OSMOSIS_INDEXER,
    OSMOSIS_RPC,
    address
  )(env, publicKey, collectionAddress, tokenId);
};
