// ===========================================================================
//  Namespacing localStorage pro produkci a GH Pages preview sloty.
// ===========================================================================

export function previewSlotFromPath(pathname = currentPathname()) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'pr' && /^\d+$/.test(parts[i + 1])) return `pr-${parts[i + 1]}`;
    if (parts[i] === 'branch' && parts[i + 1]) return `branch-${parts[i + 1]}`;
  }
  return '';
}

export function storageKey(baseKey, pathname = currentPathname()) {
  const slot = previewSlotFromPath(pathname);
  return slot ? `${baseKey}@${slot}` : baseKey;
}

function currentPathname() {
  return (typeof location !== 'undefined' && location && location.pathname) || '/';
}
