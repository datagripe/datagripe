import { create } from "zustand";

/**
 * Which object-view panels are holding an unsaved edit.
 *
 * An object view has no document, so the tab component — which reads a
 * document's `dirty` for everything else — has nothing to look at. This
 * is that, keyed by the panel's own id: small, in memory, and forgotten
 * when the panel closes, because an edit to a definition is not a draft
 * anybody wants recovered next week.
 */
interface ObjectDraftsState {
	dirty: Record<string, boolean>;
	setDirty: (viewId: string, dirty: boolean) => void;
	forget: (viewId: string) => void;
}

export const useObjectDraftsStore = create<ObjectDraftsState>()((set, get) => ({
	dirty: {},
	setDirty(viewId, dirty) {
		if ((get().dirty[viewId] ?? false) === dirty) {
			return;
		}
		set({ dirty: { ...get().dirty, [viewId]: dirty } });
	},
	forget(viewId) {
		const { [viewId]: _gone, ...rest } = get().dirty;
		set({ dirty: rest });
	},
}));
