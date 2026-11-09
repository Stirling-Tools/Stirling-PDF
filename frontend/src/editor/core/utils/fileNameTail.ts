const NAME_TAIL = /(?:\s\([^()]*\))?(?:\.[^.\s()]{1,10})?$/;

export function splitFileNameTail(name: string): {
  head: string;
  tail: string;
} {
  const tail = NAME_TAIL.exec(name)?.[0] ?? "";
  if (!tail || tail.length >= name.length) return { head: name, tail: "" };
  return { head: name.slice(0, name.length - tail.length), tail };
}
