// Message to show for a failed API call
export function errMsg(e: any): string {
  if (e?.error?.message) return e.error.message;
  if (e?.status === 0) return 'Cannot reach the server. Is the API running?';
  if (e?.status === 403) return 'You are not allowed to do this.';
  return e?.message ?? 'Something went wrong.';
}

// Round money to 2 decimals (avoids 0.1 + 0.2 style noise)
export function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// yyyy-MM-dd for date inputs
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function firstOfMonth(): string {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}
