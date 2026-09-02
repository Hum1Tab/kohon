const DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const LARGE_UNITS = ["", "万", "億", "兆", "京"] as const;

function underTenThousand(value: number): string {
  let result = "";
  const units = [[1000, "千"], [100, "百"], [10, "十"]] as const;
  let remainder = value;
  for (const [amount, label] of units) {
    const digit = Math.floor(remainder / amount);
    if (digit > 0) result += `${digit === 1 ? "" : DIGITS[digit]}${label}`;
    remainder %= amount;
  }
  if (remainder > 0) result += DIGITS[remainder];
  return result;
}

function japaneseNumeral(value: number): string {
  const normalized = Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1;
  let remaining = normalized;
  let unitIndex = 0;
  let numeral = "";
  while (remaining > 0 && unitIndex < LARGE_UNITS.length) {
    const section = remaining % 10000;
    if (section > 0) numeral = `${underTenThousand(section)}${LARGE_UNITS[unitIndex]}${numeral}`;
    remaining = Math.floor(remaining / 10000);
    unitIndex += 1;
  }
  return numeral || DIGITS[1];
}

export function defaultChapterTitle(chapterNumber: number): string {
  return `第${japaneseNumeral(chapterNumber)}章`;
}

export function defaultSceneTitle(sceneNumber: number): string {
  return `場面${japaneseNumeral(sceneNumber)}`;
}
