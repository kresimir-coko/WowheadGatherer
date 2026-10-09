/** Wraps an async lookup so only the newest call's answer is delivered; late answers to older calls are dropped. */
export function latestOnly<A, R>(run: (arg: A) => Promise<R>, deliver: (result: R) => void): (arg: A) => void {
  let latest = 0;
  return (arg) => {
    const call = ++latest;
    run(arg).then(
      (result) => {
        if (call === latest) deliver(result);
      },
      () => {
        // The lookups this wraps never reject; if one does, there's nothing to show.
      },
    );
  };
}
