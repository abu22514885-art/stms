import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// Opens a PDF for printing, or downloads it. The API needs the login token, so the file is
// fetched with the normal HTTP client and shown from a temporary browser address.
@Injectable({ providedIn: 'root' })
export class PdfService {
  /** Opens the PDF in a new tab (use the browser's Print button there). */
  print(source: Observable<Blob>, onError: (e: any) => void): void {
    // Open the tab now, inside the click, or the browser blocks the pop-up
    const tab = window.open('', '_blank');
    source.subscribe({
      next: blob => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (tab) tab.location.href = url;
        else window.location.href = url;
      },
      error: e => { tab?.close(); onError(e); }
    });
  }

  download(source: Observable<Blob>, fileName: string, onError: (e: any) => void): void {
    source.subscribe({
      next: blob => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      },
      error: onError
    });
  }

  /** Shows an image blob (payment screenshot) in a new tab. */
  showImage(source: Observable<Blob>, onError: (e: any) => void): void {
    const tab = window.open('', '_blank');
    source.subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
      },
      error: e => { tab?.close(); onError(e); }
    });
  }
}
