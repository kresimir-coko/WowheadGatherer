/** Remembers the last answer: compute runs only when the key changes. */
export function memoLast<K, V>(): (key: K, compute: () => V) => V {
  let known = false;
  let lastKey: K | undefined;
  let lastValue: V | undefined;
  return (key, compute) => {
    if (!known || key !== lastKey) {
      lastValue = compute();
      lastKey = key;
      known = true;
    }
    return lastValue as V;
  };
}
