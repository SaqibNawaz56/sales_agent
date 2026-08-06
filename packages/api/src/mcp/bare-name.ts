/** The adapter may namespace tools as "<server>__<tool>". */
export function bareName(name: string): string {
  const separator = name.lastIndexOf("__");
  return separator === -1 ? name : name.slice(separator + 2);
}
