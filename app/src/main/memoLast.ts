/** Remembers the last answer worth keeping: compute runs only when the key changes, or the answer wasn't kept. */
export function memoLast<K, V>(keep: (value: V) => boolean = () => true): (key: K, compute: () => V) => V {
  let known = false;
  let lastKey: K | undefined;
  let lastValue: V | undefined;
  return (key, compute) => {
    if (!known || key !== lastKey) {
      lastValue = compute();
      lastKey = key;
      known = keep(lastValue);
    }
    return lastValue as V;
  };
}
