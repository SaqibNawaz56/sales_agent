/** "a", "a or b", "a, b or c" — for offering catalogue suggestions. */
export function formatList(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
