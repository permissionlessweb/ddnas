import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError } from "../error";
import { secp256k1PublicKeyToBech32Address } from "../utils";
import { getOwnedNftImageUrl as makeCw721GetOwnedNftImageUrl } from "./cw721";

const JUNO_INDEXER = "https://juno-mainnet.indexer.zone/";
const JUNO_RPC = "https://juno-rpc.reece.sh";

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  env,
  publicKey,
  collectionAddress,
  tokenId
) => {
  let junoAddress;
  try {
    junoAddress = secp256k1PublicKeyToBech32Address(publicKey, "juno");
  } catch (err) {
    console.error("PK to Address", err);
    throw new KnownError(400, "Invalid public key", err);
  }

  return await makeCw721GetOwnedNftImageUrl(env.INDEXER_API_KEY ? JUNO_INDEXER + env.INDEXER_API_KEY : undefined, JUNO_RPC, junoAddress)(
    env,
    publicKey,
    collectionAddress,
    tokenId
  );
};
