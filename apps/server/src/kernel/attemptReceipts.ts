import type { ActionReceipt } from '@mahjongplus/shared';

export class AttemptReceiptStore {
  private readonly processed = new Map<string, ActionReceipt>();
  private readonly recentValues: ActionReceipt[] = [];
  constructor(private readonly recentLimit = 20) {}
  get(attemptId: string): ActionReceipt | undefined { return this.processed.get(attemptId); }
  record(receipt: ActionReceipt): void {
    this.processed.set(receipt.attemptId, receipt);
    this.recentValues.push(receipt);
    while (this.recentValues.length > this.recentLimit) this.recentValues.shift();
  }
  recentNewestFirst(): ActionReceipt[] { return [...this.recentValues].reverse(); }
}
