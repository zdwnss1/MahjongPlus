import type { ActionReceipt } from '@mahjongplus/shared';

export function ReceiptCard({ receipt, compact = false }: { receipt: ActionReceipt; compact?: boolean }) {
  return <article className={`receipt receipt-${receipt.outcome}`}><strong>{receipt.outcome}</strong><span>{receipt.action.type}</span>{!compact && <span>revision {receipt.revisionBefore} → {receipt.revisionAfter}</span>}{receipt.violations.map((entry) => <p key={entry.code}>{entry.message}</p>)}{receipt.penalties.map((entry, index) => <p key={`${entry.playerId}-${index}`}>{entry.message}</p>)}</article>;
}
