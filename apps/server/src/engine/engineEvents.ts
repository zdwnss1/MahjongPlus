import { SEATS } from '@mahjongplus/shared';

export function tilesFromHandString(value: string): string[] {
  const concealed = value.split(',')[0].replace(/\*$/, '');
  const tiles: string[] = [];
  for (const group of concealed.match(/[mpsz]\d+/g) ?? []) {
    const suit = group[0];
    for (const digit of group.slice(1)) tiles.push(`${suit}${digit}`);
  }
  return tiles;
}

export function roundLabel(zhuangfeng: number, jushu: number): string {
  return `${['东', '南', '西', '北'][zhuangfeng] ?? '?'}${jushu + 1}局`;
}

export function eventSignature(message: any): string {
  if (message?.qipai) return `qipai:${message.qipai.zhuangfeng}:${message.qipai.jushu}`;
  if (message?.zimo) return `zimo:${message.zimo.l}`;
  if (message?.gangzimo) return `gangzimo:${message.gangzimo.l}`;
  if (message?.dapai) return `dapai:${message.dapai.l}:${message.dapai.p}`;
  if (message?.fulou) return `fulou:${message.fulou.l}:${message.fulou.m}`;
  if (message?.gang) return `gang:${message.gang.l}:${message.gang.m}`;
  if (message?.hule) return `hule:${message.hule.l}`;
  if (message?.pingju) return `pingju:${message.pingju.name}`;
  if (message?.kaigang) return `kaigang:${message.kaigang.baopai}`;
  return JSON.stringify(message);
}

export function describeEngineEvent(message: any, previous: string): string {
  if (message?.qipai) return `${roundLabel(message.qipai.zhuangfeng, message.qipai.jushu)} 配牌`;
  if (message?.zimo) return `${SEATS[message.zimo.l]} 摸牌`;
  if (message?.gangzimo) return `${SEATS[message.gangzimo.l]} 岭上摸牌`;
  if (message?.dapai) return `${SEATS[message.dapai.l]} 打 ${message.dapai.p}`;
  if (message?.fulou) return `${SEATS[message.fulou.l]} 副露 ${message.fulou.m}`;
  if (message?.gang) return `${SEATS[message.gang.l]} 杠 ${message.gang.m}`;
  if (message?.hule) return `${SEATS[message.hule.l]} 和牌`;
  if (message?.pingju) return `流局：${message.pingju.name}`;
  if (message?.kaigang) return `新宝牌指示牌 ${message.kaigang.baopai}`;
  return previous;
}
