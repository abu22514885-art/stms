// Ethiopian calendar and clock, worked out in the browser.
// Rules used (from https://www.metaappz.com/References/Time_and_Date_in_Ethiopia):
//  - 13 months: 12 of 30 days plus Pagume (5 days, 6 in a leap year). The year starts on Meskerem 1 (about 11 September).
//  - The day starts at 6:00 Western time. Western 6:00 = Ethiopian 12:00. So Ethiopian hour = (hour + 6) mod 12.
//  - Day periods: ጠዋት (6:00-11:59), ከሰዓት (12:00-17:59), ምሽት (18:00-23:59), ሌሊት (0:00-5:59), Western times.
//  - Checked against the page's example dates (see the checks at the bottom of this file).
export const ET_MONTHS = ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን'];
export const ET_DAYS = ['እሁድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'];
export const ET_ZONE = 'Africa/Addis_Ababa';

export interface EtDateTime {
  year: number; month: number; day: number;      // Ethiopian calendar
  weekday: number;                               // 0 = Sunday
  hour: number; minute: number;                  // Western 24-hour clock (Addis Ababa)
}

function floorDiv(a: number, b: number): number { return Math.floor(a / b); }

function gregorianToJdn(y: number, m: number, d: number): number {
  const a = floorDiv(14 - m, 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + floorDiv(153 * m2 + 2, 5) + 365 * y2 + floorDiv(y2, 4) - floorDiv(y2, 100) + floorDiv(y2, 400) - 32045;
}

export function gregorianToEthiopian(y: number, m: number, d: number): { year: number; month: number; day: number } {
  const jdn = gregorianToJdn(y, m, d);
  const r = (jdn - 1723856) % 1461;
  const rr = r < 0 ? r + 1461 : r;
  const n = (rr % 365) + 365 * floorDiv(rr, 1460);
  const year = 4 * floorDiv(jdn - 1723856, 1461) + floorDiv(rr, 365) - floorDiv(rr, 1460);
  return { year, month: floorDiv(n, 30) + 1, day: (n % 30) + 1 };
}

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short'
});
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The moment as seen in Addis Ababa (the shop's time zone), as Ethiopian calendar fields
export function toEthiopian(date: Date): EtDateTime {
  const p: Record<string, string> = {};
  for (const x of parts.formatToParts(date)) p[x.type] = x.value;
  const e = gregorianToEthiopian(Number(p['year']), Number(p['month']), Number(p['day']));
  return { ...e, weekday: WEEK.indexOf(p['weekday']), hour: Number(p['hour']) % 24, minute: Number(p['minute']) };
}

export function etPeriod(hour: number): string {
  if (hour >= 6 && hour < 12) return 'ጠዋት';
  if (hour >= 12 && hour < 18) return 'ከሰዓት';
  if (hour >= 18) return 'ምሽት';
  return 'ሌሊት';
}

export function etClock(hour: number, minute: number): string {
  const h = (hour + 6) % 12 || 12;
  return `${etPeriod(hour)} ${h}:${String(minute).padStart(2, '0')}`;
}

export function etDateText(e: EtDateTime, withWeekday = false): string {
  const core = `${ET_MONTHS[e.month - 1]} ${e.day}, ${e.year}`;
  return withWeekday ? `${ET_DAYS[e.weekday]}, ${core}` : core;
}

/*
 Checks (from the reference page):
   12 Sep 2027 = መስከረም 1, 2020      gregorianToEthiopian(2027, 9, 12) -> { year: 2020, month: 1, day: 1 }
   29 Nov 2026 = ኅዳር 20, 2019        gregorianToEthiopian(2026, 11, 29) -> { year: 2019, month: 3, day: 20 }
   7 Jan 2027  = ታኅሣሥ 29, 2019      gregorianToEthiopian(2027, 1, 7) -> { year: 2019, month: 4, day: 29 }
   6:00 -> ጠዋት 12:00, 12:00 -> ከሰዓት 6:00, 18:00 -> ምሽት 12:00, 0:00 -> ሌሊት 6:00
*/
