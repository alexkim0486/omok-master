function pick(val: string | undefined, fallback: string): string {
  return val && val.trim() ? val.trim() : fallback;
}

const name      = pick(process.env.NEXT_PUBLIC_SITE_NAME,    "공부인 스터디카페");
const shortName = pick(process.env.NEXT_PUBLIC_SITE_SHORT,   "공부인");
const center    = pick(process.env.NEXT_PUBLIC_SITE_CENTER,  "화정센터");
const address   = pick(process.env.NEXT_PUBLIC_SITE_ADDRESS, "광주 서구 군분로179번길 14 3층");
const phone     = pick(process.env.NEXT_PUBLIC_SITE_PHONE,   "010-4199-4170");

export const SITE = {
  name,
  shortName,
  center,
  address,
  phone,
  nameWithCenter: `${name} ${center}`,
} as const;
