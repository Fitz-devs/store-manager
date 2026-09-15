import Taro from '@tarojs/taro'
import { formatFen } from './format'

export type LowPriceIssue = {
  kind: 'retail' | 'friend'
  sell: number
  cost: number
}

/** Detect sell prices strictly below purchase cost (fen). */
export function findLowPriceIssues(params: {
  retail: number | null | undefined
  friend?: number | null
  purchase: number | null | undefined
}): LowPriceIssue[] {
  const cost = params.purchase
  if (cost == null || cost <= 0) return []
  const issues: LowPriceIssue[] = []
  if (params.retail != null && params.retail > 0 && params.retail < cost) {
    issues.push({ kind: 'retail', sell: params.retail, cost })
  }
  if (params.friend != null && params.friend > 0 && params.friend < cost) {
    issues.push({ kind: 'friend', sell: params.friend, cost })
  }
  return issues
}

export function describeLowPriceIssues(issues: LowPriceIssue[]): string {
  return issues
    .map(
      (issue) =>
        `${issue.kind === 'retail' ? '零售价' : '友情价'} ${formatFen(issue.sell)} < 进货价 ${formatFen(issue.cost)}`,
    )
    .join('\n')
}

/** Manual price save: always block when underpriced. Returns true if save may proceed. */
export async function guardManualLowPrice(issues: LowPriceIssue[]): Promise<boolean> {
  if (!issues.length) return true
  await Taro.showModal({
    title: '售价低于进货价，已阻止保存',
    content: `${describeLowPriceIssues(issues)}\n请先调高售价或降低进货价`,
    showCancel: false,
    confirmText: '我知道了',
  })
  return false
}

/** After purchase import: prompt (non-blocking) to go adjust prices. */
export async function promptAfterPurchaseLowPrice(
  lines: Array<{ label: string; issues: LowPriceIssue[] }>,
): Promise<void> {
  const flagged = lines.filter((line) => line.issues.length > 0)
  if (!flagged.length) return
  const content = flagged
    .slice(0, 6)
    .map((line) => `${line.label}\n  ${describeLowPriceIssues(line.issues)}`)
    .join('\n')
  const extra = flagged.length > 6 ? `\n…共 ${flagged.length} 项` : ''
  await Taro.showModal({
    title: '入库已记录，有商品售价偏低',
    content: `${content}${extra}\n\n可稍后在商品详情调整售价`,
    confirmText: '知道了',
    showCancel: false,
  })
}
