import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { Settled as SettledEvent } from '../generated/Settlement/Settlement'
import { Settlement } from '../generated/schema'

function toDecimal(raw: BigInt, decimals: i32 = 18): BigDecimal {
  const scale = BigInt.fromI32(10).pow(u8(decimals))
  return raw.toBigDecimal().div(scale.toBigDecimal())
}

export function handleSettled(event: SettledEvent): void {
  const id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  const s  = new Settlement(id)
  s.trader          = event.params.buyer
  s.token           = event.params.baseToken
  s.amount          = toDecimal(event.params.quantity)
  s.fee             = toDecimal(event.params.fee)
  s.blockNumber     = event.block.number
  s.blockTimestamp  = event.block.timestamp
  s.transactionHash = event.transaction.hash
  s.save()
}
