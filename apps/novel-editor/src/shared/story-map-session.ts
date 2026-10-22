import { emptyStoryMap, validateStoryMap, type StoryMap } from "@kohon/project-store/story-map";

export interface StoryMapSnapshot {
  map: StoryMap; status: "loading" | "saved" | "dirty" | "saving" | "error";
  error: string | null; canUndo: boolean; canRedo: boolean; hydrated: boolean;
}
type Storage = { read(): Promise<StoryMap>; save(map: StoryMap, revision: number): Promise<StoryMap> };
/** One session per project, kept alive when its dock tab is hidden or moved. */
export class StoryMapSession {
  private state: StoryMapSnapshot = { map: emptyStoryMap(), status: "loading", error: null, canUndo: false, canRedo: false, hydrated: false };
  private listeners = new Set<() => void>();
  private past: StoryMap[] = [];
  private future: StoryMap[] = [];
  private version = 0;
  private savedVersion = 0;
  private revision = 0;
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | null = null;
  private loading: Promise<void> | null = null;
  private editKey: string | null = null;
  private lastEdit = 0;
  constructor(private readonly storage: Storage) {}
  getSnapshot = (): StoryMapSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<StoryMapSnapshot>): void {
    const editable = this.loaded && (patch.status ?? this.state.status) !== "loading";
    this.state = { ...this.state, ...patch, canUndo: editable && this.past.length > 0, canRedo: editable && this.future.length > 0 };
    this.listeners.forEach(listener => listener());
  }
  load = (): Promise<void> => {
    if (this.loading !== null) return this.loading;
    this.loading = this.read().finally(() => { this.loading = null; }); return this.loading;
  };
  private async read(): Promise<void> {
    this.emit({ status: "loading", error: null });
    try {
      const map = validateStoryMap(await this.storage.read());
      this.revision = map.revision; this.version = 0; this.savedVersion = 0; this.past = []; this.future = []; this.loaded = true;
      this.emit({ map, status: "saved", hydrated: true });
    } catch (cause) { this.loaded = false; this.emit({ status: "error", error: String(cause), hydrated: false }); }
  }
  change = (map: StoryMap, key: string | null = null): void => {
    if (!this.loaded || this.state.status === "loading") return;
    if (JSON.stringify(map) === JSON.stringify(this.state.map)) return;
    const now = Date.now();
    if (key === null || key !== this.editKey || now - this.lastEdit > 1200) { this.past.push(this.state.map); if (this.past.length > 80) this.past.shift(); }
    this.editKey = key; this.lastEdit = now; this.future = []; this.version++;
    this.emit({ map, status: "dirty", error: null }); this.schedule();
  };
  private schedule(): void { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush().catch(() => undefined); }, 450); }
  undo = (): void => {
    if (!this.loaded || this.state.status === "loading") return;
    const map = this.past.pop(); if (!map) return;
    this.future.push(this.state.map); this.editKey = null; this.version++; this.emit({ map, status: "dirty", error: null }); this.schedule();
  };
  redo = (): void => {
    if (!this.loaded || this.state.status === "loading") return;
    const map = this.future.pop(); if (!map) return;
    this.past.push(this.state.map); this.editKey = null; this.version++; this.emit({ map, status: "dirty", error: null }); this.schedule();
  };
  flush = async (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.loading) await this.loading;
    if (!this.loaded) return;
    if (this.pending !== null) { await this.pending; if (this.savedVersion !== this.version) await this.flush(); return; }
    if (this.savedVersion === this.version) return;
    this.pending = this.drain();
    try { await this.pending; } finally { this.pending = null; }
  };
  private async drain(): Promise<void> {
    try {
      while (this.savedVersion !== this.version) {
        const savingVersion = this.version; const map = this.state.map; this.emit({ status: "saving" });
        const saved = await this.storage.save(map, this.revision);
        this.revision = saved.revision; this.savedVersion = savingVersion;
      }
      this.emit({ map: { ...this.state.map, revision: this.revision }, status: "saved", error: null });
    } catch (cause) { this.emit({ status: "error", error: String(cause) }); throw cause; }
  }
  reload = async (): Promise<void> => { await this.flush(); await this.load(); };
  /** Only for an explicit discard action. Waiting prevents an old write racing the new read. */
  discardAndReload = async (): Promise<void> => {
    clearTimeout(this.timer); this.loaded = false; this.emit({ status: "loading" });
    if (this.pending) await this.pending.catch(() => undefined);
    await this.load();
  };
}
