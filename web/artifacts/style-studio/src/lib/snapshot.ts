/**
 * Resolve a stored look snapshot value to a displayable image URL.
 *
 * New snapshots are stored in object storage and referenced by an
 * "/objects/..." path served via the API's storage routes. Legacy
 * snapshots are base64 data URLs and are usable as-is.
 */
export function snapshotSrc(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('/objects/')) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    return `${base}/api/storage${value}`;
  }
  return value;
}
