import { KnownError } from './error'

export const DDNAS_WIDGET_ITEM = 'widget%3Addnas'

export const getIsDaoMember = async (
  chainId: string,
  daoMemberAddr: string,
  daoAddr: string
): Promise<boolean> => {
  try {
    let votingPower
    const res = await fetch(
      `https://indexer.daodao.zone/${chainId}/contract/${daoAddr}/daoCore/votingPower?address=${daoMemberAddr}`
    )
    if (!res.ok) {
      throw new Error(await res.text().catch(() => 'Unknown error.'))
    }
    const responseText = await res.text()
    try {
      votingPower = JSON.parse(responseText)
    } catch (e) {
      votingPower = responseText
    }
    // console.log('votingPower:', votingPower)
    return votingPower && votingPower !== '0'
  } catch (err) {
    console.error(err)
    throw new KnownError(500, 'Failed to get the address voting power.', err)
  }
}

export const getDnasParamms = async (
  chainId: string,
  daoAddr: string
): Promise<DnasWidgetParams> => {
  try {
    const res = await fetch(
      `https://indexer.daodao.zone/${chainId}/contract/${daoAddr}/daoCore/item?key=${DDNAS_WIDGET_ITEM}`
    )
    if (!res.ok) {
      throw new Error(await res.text().catch(() => 'Unknown error.'))
    }

    // assert this response was returned with correct type
    let response: DnasWidgetParams = await res.json()

    return response
  } catch (err) {
    console.error(err)
    throw new KnownError(
      500,
      'Failed to get fetch list of DAOs this address is a member of.',
      err
    )
  }
}

export interface DaoInfo {
  version: string
  contract: string
}

export interface DaoConfig {
  name: string
  image_url: string
  description: string
  automatically_add_cw20s: boolean
  automatically_add_cw721s: boolean
}

export interface DnasWidgetParams {
  version: string
  defaultExpiration: number
}
