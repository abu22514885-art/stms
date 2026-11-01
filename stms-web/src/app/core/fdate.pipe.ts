import { Pipe, PipeTransform } from '@angular/core';
import { lang } from './i18n';
import { ET_ZONE, etClock, etDateText, toEthiopian } from './ethiopian';

export type DateKind = 'date' | 'time' | 'datetime';

const enDate = new Intl.DateTimeFormat('en-GB', { timeZone: ET_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const enTime = new Intl.DateTimeFormat('en-GB', { timeZone: ET_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });

export function formatDate(value: string | Date | null | undefined, kind: DateKind): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '';
  if (lang() === 'am') {
    const e = toEthiopian(d);
    const date = etDateText(e);
    const time = etClock(e.hour, e.minute);
    return kind === 'date' ? date : kind === 'time' ? time : `${date}, ${time}`;
  }
  return kind === 'date' ? enDate.format(d) : kind === 'time' ? enTime.format(d) : `${enDate.format(d)}, ${enTime.format(d)}`;
}

// English: 29 Nov 2026, 14:05.   Amharic: ኅዳር 20, 2019, ከሰዓት 8:05
@Pipe({ name: 'fdate', standalone: true, pure: false })
export class FdatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, kind: DateKind = 'datetime'): string {
    return formatDate(value, kind);
  }
}
