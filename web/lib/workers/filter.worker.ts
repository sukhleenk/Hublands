import { applyFilters, type FilterableAttrs, type FilterState } from "../filters";

let attrs: FilterableAttrs | null = null;

interface InitMsg {
  type: "init";
  kind: Uint8Array;
  task: Uint8Array;
  library: Uint8Array;
  license: Uint8Array;
  downloads: Uint32Array;
  created_week: Uint16Array;
}
interface FilterMsg {
  type: "filter";
  filters: FilterState;
  epoch: number;
}

self.onmessage = (e: MessageEvent<InitMsg | FilterMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    attrs = {
      kind: msg.kind,
      task: msg.task,
      library: msg.library,
      license: msg.license,
      downloads: msg.downloads,
      created_week: msg.created_week,
    };
    self.postMessage({ type: "ready" });
  } else if (msg.type === "filter" && attrs) {
    const mask = new Float32Array(attrs.kind.length);
    applyFilters(attrs, msg.filters, mask);
    self.postMessage({ type: "mask", mask, epoch: msg.epoch }, { transfer: [mask.buffer] });
  }
};
