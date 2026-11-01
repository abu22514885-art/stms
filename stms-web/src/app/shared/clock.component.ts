import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { formatDate } from '../core/fdate.pipe';
import { lang } from '../core/i18n';
import { ET_DAYS, ET_ZONE, toEthiopian } from '../core/ethiopian';

// Today's date and time in the top bar. Amharic: Ethiopian calendar and Ethiopian 12-hour clock.
@Component({
  selector: 'app-clock',
  standalone: true,
  template: `<span class="clock">{{ text() }}</span>`
})
export class ClockComponent implements OnInit, OnDestroy {
  private now = signal(new Date());
  private timer: any;

  text(): string {
    const d = this.now();
    if (lang() === 'am') return `${ET_DAYS[toEthiopian(d).weekday]}, ${formatDate(d, 'datetime')}`;
    const day = new Intl.DateTimeFormat('en-GB', { timeZone: ET_ZONE, weekday: 'short' }).format(d);
    return `${day}, ${formatDate(d, 'datetime')}`;
  }

  ngOnInit(): void { this.timer = setInterval(() => this.now.set(new Date()), 15000); }
  ngOnDestroy(): void { clearInterval(this.timer); }
}
