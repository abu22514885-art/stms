import { Pipe, PipeTransform } from '@angular/core';
import { tr } from './i18n';

// In a template: 'Save' | t   or   'Page {n}' | t:{ n: 3 }
@Pipe({ name: 't', standalone: true, pure: false })
export class TPipe implements PipeTransform {
  transform(en: string | null | undefined, params?: Record<string, string | number>): string {
    return en ? tr(en, params) : '';
  }
}
