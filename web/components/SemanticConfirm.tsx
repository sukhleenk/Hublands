"use client";

// Consent step before pulling the embedding model. It downloads once and runs
// on the visitor's own machine, so we say so plainly before spending their
// bandwidth and memory.

export default function SemanticConfirm({
  mb,
  onConfirm,
  onCancel,
}: {
  mb: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-abyss/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sem-confirm-title"
      onClick={onCancel}
    >
      <div
        className="panel w-[min(420px,calc(100vw-2rem))] p-5 text-chalk"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="label-caps text-[9px] text-chalk/45">Before you dive in</div>
        <h2 id="sem-confirm-title" className="mt-1 font-display text-[17px] font-semibold">
          Turn on semantic search
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-chalk/80">
          This downloads the embedding model once (about {mb} MB) and keeps it,
          plus the vectors, in memory while this tab is open, roughly 35 MB of
          RAM.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-chalk/80">
          It runs on your machine. Nothing you type is sent anywhere. You can
          turn it back off and clear the download at any time.
        </p>
        <div className="mt-5 flex justify-end gap-2 font-mono text-[12px]">
          <button
            onClick={onCancel}
            className="border hairline px-3 py-1.5 text-chalk/70 hover:text-chalk"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="border border-chalk/50 bg-chalk/10 px-3 py-1.5 text-chalk hover:bg-chalk/15"
          >
            Download and enable
          </button>
        </div>
      </div>
    </div>
  );
}
