export function genId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : ('r_' + Date.now() + '_' + Math.random().toString(36).slice(2));
}
