// မြန်မာ ကိန်းဂဏန်း → English ကိန်း convert
export function toEnglishNumber(value: string): string {
  return value
    .replace(/၀/g, '0')
    .replace(/၁/g, '1')
    .replace(/၂/g, '2')
    .replace(/၃/g, '3')
    .replace(/၄/g, '4')
    .replace(/၅/g, '5')
    .replace(/၆/g, '6')
    .replace(/၇/g, '7')
    .replace(/၈/g, '8')
    .replace(/၉/g, '9')
}

export function parseMyNumber(value: string): number {
  return parseFloat(toEnglishNumber(value)) || 0
}
