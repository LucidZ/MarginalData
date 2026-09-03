// Sequential encodings are done as 7 discrete buckets mapped to CSS classes
// (.voa-seq-0 .. .voa-seq-6, defined in App.css) rather than a continuous
// D3 color scale returning raw hex. Every other chart in this codebase
// keeps color in CSS custom properties so light/dark swap automatically
// (see .voa-root in App.css) - a JS-computed hex would need its own
// matchMedia/data-theme watcher that nothing else here has, for a
// smoothness gain (64 continuous shades vs 7 discrete ones) that doesn't
// matter at dot-sized marks.
const SEQ_BUCKETS = 7;

/** Maps t in [0,1] to one of 7 sequential bucket classes, light->dark. */
export function seqBucketClass(t: number, prefix = "voa-seq"): string {
  const clamped = Math.max(0, Math.min(1, t));
  const bucket = Math.min(SEQ_BUCKETS - 1, Math.floor(clamped * SEQ_BUCKETS));
  return `${prefix}-${bucket}`;
}

export const SEQ_BUCKET_COUNT = SEQ_BUCKETS;
