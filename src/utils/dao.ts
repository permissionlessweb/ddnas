import { ProfileDnasKeyWithValue } from "../types"
import { KnownError } from "./error"


export const DDNAS_WIDGET_ITEM = "widget:dnas"

export const getIsDaoMember = async (
    chainId: string,
    daoMemberAddr: string,
    daoAddr: string
): Promise<boolean> => {
    try {
        const res = await fetch(`https://indexer.daodao.zone/${chainId}/contract/${daoAddr}/daoCore/votingPower/${daoMemberAddr}`)
        if (!res.ok) { throw new Error(await res.text().catch(() => 'Unknown error.')) }
        const daoList: string = await res.json()
        return daoList != "0"
    } catch (err) {
        console.error(err)
        throw new KnownError(500, 'Failed to get fetch list of DAOs this address is a member of.', err)
    }
}


export const getDnasParamms = async (
    chainId: string,
    daoAddr: string
): Promise<DnasWidgetParams> => {

    try {
        const res = await fetch(
            `https://indexer.daodao.zone/${chainId}/contract/${daoAddr}/daoCore/${DDNAS_WIDGET_ITEM}`
        )

        if (!res.ok) {
            throw new Error(await res.text().catch(() => 'Unknown error.'))
        }
        // assert this response was returned with correct type
        let response: DnasWidgetParams = await res.json()

        return response
    } catch (err) {
        console.error(err)
        throw new KnownError(500, 'Failed to get fetch list of DAOs this address is a member of.', err)
    }
}


export interface DaoInfo {
    version: string;
    contract: string;
}

export interface DaoConfig {
    name: string;
    image_url: string;
    description: string;
    automatically_add_cw20s: boolean;
    automatically_add_cw721s: boolean;
}



export interface DnasWidgetParams {
    version: string;
    defaultExpiration: number;
}