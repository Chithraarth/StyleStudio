/**
 * Pure helpers for the orphaned-snapshot sweep (snapshotSweep.ts).
 *
 * Kept free of db/object-storage imports so the reference-matching
 * logic — the part that decides whether a stored photo is safe to
 * delete — can be unit-tested in isolation (see snapshotRefs.test.ts).
 */

export function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith('/')) path = `/${path}`;
  const parts = path.split('/');
  if (parts.length < 3) {
    throw new Error('Invalid path: must contain at least a bucket name');
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join('/') };
}

/** Strips a single trailing slash, e.g. "/bucket/.private/" -> "/bucket/.private". */
export function normalizePrivateDir(privateDir: string): string {
  return privateDir.endsWith('/') ? privateDir.slice(0, -1) : privateDir;
}

/**
 * Maps looks.snapshotDataUrl values to the set of stored object names they
 * reference. Non "/objects/..." values (legacy base64 data URLs, nulls, etc.)
 * are ignored.
 */
export function collectReferencedObjectNames(
  privateDir: string,
  snapshotDataUrls: Array<string | null>,
): Set<string> {
  const dir = normalizePrivateDir(privateDir);
  const referenced = new Set<string>();
  for (const ref of snapshotDataUrls) {
    if (!ref || !ref.startsWith('/objects/')) continue; // legacy base64 data URLs etc.
    const entityId = ref.slice('/objects/'.length);
    const { objectName } = parseObjectPath(`${dir}/${entityId}`);
    referenced.add(objectName);
  }
  return referenced;
}

/** Returns the stored object names that no look references (deletion candidates). */
export function findOrphanObjectNames(
  storedObjectNames: string[],
  referenced: ReadonlySet<string>,
): string[] {
  return storedObjectNames.filter((name) => !referenced.has(name));
}
