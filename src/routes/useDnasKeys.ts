import { fromBech32, toHex } from "@cosmjs/encoding";
import { makePublicKey } from "../publicKeys";
import { AuthorizedRequest, Env, FileMetadata, UseDnasKeyRequest, UseDnasKeyResponse } from "../types";
import { getDnasParamms, getIsDaoMember } from "../utils/dao";
import { getDnasApiKeyValue, getProfileDnasApiKeys, getProfileFromAddressHex, respond } from "../utils";
import { JackalErrorResponse, JackalSuccessResponse } from "../utils/jackal";


const jackalApiCreateCollectionBase = 'https://pinapi.jackalprotocol.com/api/collections/test21233'
const jackalApiUploadFileBase = 'https://pinapi.jackalprotocol.com/api/files'
const jackalApiUploadMultipleFileBase = 'https://pinapi.jackalprotocol.com/api/v1/files'
const jackalApiAddFileToCollection = 'https://pinapi.jackalprotocol.com/api/files'



export const useDnasKeys = async (
    request: AuthorizedRequest<UseDnasKeyRequest>,
    env: Env
) => {

    const {
        parsedBody: { data },
        publicKey,
    } = request;
    console.log("Starting useDnasKeys function");
    console.log(data.files)

    // Validate public key.
    const dnasChainpublicKey = makePublicKey(
        data.auth.publicKeyType,
        data.auth.publicKeyHex
    );

    const signer = dnasChainpublicKey.getBech32Address(data.auth.chainBech32Prefix);
    console.log("signer", signer);

    const daoMember = await getIsDaoMember(data.auth.chainId, signer, data.dao);
    if (!daoMember) {
        return respond(500, {
            error: 'Addr is not member of DAO'
        });
    }

    // confirm dao has widget enabled
    const dnsParams = await getDnasParamms(data.auth.chainId, data.dao);
    console.log("DNAS PARAMS FOUND", dnsParams);

    // get profile for member 
    const bech32Address = data.keyOwner.trim();
    const addressHex = toHex(fromBech32(bech32Address).data);

    const profile = await getProfileFromAddressHex(env, addressHex);
    if (!profile) {
        return respond(500, {
            error: 'Dao member has not registered a profile for Dnas support.'
        });
    }

    const profileDnasApiKeys = await getProfileDnasApiKeys(env, profile.id);

    // - key owner has registered a key to this dao
    const thisDnasApi = profileDnasApiKeys.find((key) =>
        key.row.chainId === data.auth.chainId && key.row.daoAddr === data.dao
    );
    if (!thisDnasApi) {
        return respond(500, {
            error: 'Dao member has no dnas api key for this DAO.'
        });
    }
    console.log("THIS DAO SPECIFIC DNAS API KEY FOUND", thisDnasApi);

    // get the actual api key
    let apiKey = await getDnasApiKeyValue(env, thisDnasApi.row.id);
    if (!apiKey) {
        return respond(500, {
            error: 'Unable to resolve apiKey.'
        });
    }


    try {
        // Create a new FormData for the outgoing request
        const outgoingForm = new FormData();
        outgoingForm.append("files", data.files[0]);

        // Log what we're actually sending
        console.log("FormData entries:", outgoingForm);
        // @ts-ignore: FormData has forEach in browsers but might not be recognized in your environment

        // Better error handling with async/await
        const options: RequestInit = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${Buffer.from(apiKey, 'base64').toString('utf-8')}`,

            },
            body: outgoingForm // Include the FormData as the request body
        };
        console.log("got this far, we are hitting the jackal api...")
        const response = await fetch(jackalApiUploadMultipleFileBase, options);
        if (response.ok) {
            const res: JackalSuccessResponse = await response.json();
            console.log(res)
            return respond(200, {
                success: true,
                cid: res.cid,
                type: res.fileType,
                id: res.fileId
            });
        } else {
            const res: JackalErrorResponse = await response.json();
            return respond(500, {
                error: `Error id: ${response.status}: ${res.message}`
            });
        }
        // 200 == success
        // 401 == unauthoirzed
        // 413 == file too large, key limit reached

    } catch (err) {
        console.error(err);
        return respond(500, {
            error: `Network error: ${err}`
        });
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
//   .then(response => console.log(response))
//   .catch(err => console.error(err));


// create new collection 
// const options = {method: 'POST', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{name}', options)
//   .then(response => response.json())
//   .then(response => console.log(response))
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
//   .then(response => console.log(response))
//   .catch(err => console.error(err));

// add file to collection 
// const options = {method: 'PUT', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{id}/{fileid}', options)
//   .then(response => response.json())
//   .then(response => console.log(response))
//   .catch(err => console.error(err));

// add collection to collection 
// const options = {method: 'PUT', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{id}/c/{collectionid}', options)
//   .then(response => response.json())
//   .then(response => console.log(response))
//   .catch(err => console.error(err));7