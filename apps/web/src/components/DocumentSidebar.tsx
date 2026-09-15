import { useEffect, useState } from "react";
import type { EditorDocument } from "../stores/documents";
import { useDocumentsStore } from "../stores/documents";
import { useViewsStore } from "../stores/views";
import { IconClose } from "./icons";

export type DocumentSidebarProps = {
	/** Which list this renders; the tree root owns the heading and `new`. */
	kind: "shared" | "scratch";
	onOpen: (documentId: string) => void;
	onDiscard: (documentId: string) => void;
};

/**
 * One list of documents, under its root in the files tree
 * (`FilesSection`): local scratchpads (IndexedDB, never shared) or
 * workspace files (server-side, shared with every member). Files opened
 * from a datasource path are shared documents too but belong to their
 * own root (docs/spec/datasource-paths.md), so they are excluded here
 * rather than listed twice. Closing a tab never discards a document —
 * only the explicit discard action here does.
 */
export function DocumentSidebar(props: DocumentSidebarProps) {
	const order = useDocumentsStore((state) => state.order);
	const documents = useDocumentsStore((state) => state.documents);
	const views = useViewsStore((state) => state.views);
	const activeViewId = useViewsStore((state) => state.activeViewId);

	const activeDocumentId =
		activeViewId !== null ? views[activeViewId]?.documentId : undefined;
	const openDocumentIds = new Set(
		Object.values(views).map((view) => view.documentId),
	);

	const [menu, setMenu] = useState<{
		x: number;
		y: number;
		doc: EditorDocument;
	} | null>(null);

	const rename = (doc: EditorDocument) => {
		const title = window.prompt("Rename document", doc.title);
		if (title !== null && title.trim().length > 0) {
			useDocumentsStore.getState().renameDocument(doc.id, title.trim());
		}
	};

	const remove = (doc: EditorDocument) => {
		if (
			!doc.dirty ||
			window.confirm(`Discard "${doc.title}" and its unsaved changes?`)
		) {
			props.onDiscard(doc.id);
		}
	};

	// Context menu dismisses on outside click / Escape.
	useEffect(() => {
		if (menu === null) {
			return;
		}
		const close = () => setMenu(null);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setMenu(null);
			}
		};
		window.addEventListener("mousedown", close);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("mousedown", close);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [menu]);

	const scratch = order.filter((id) => documents[id]?.shared !== true);
	// A file opened from a datasource path is a shared document too, but
	// it belongs to its own path section — listing it here as well would
	// show one file in two places with two different names for what it is.
	const shared = order.filter(
		(id) => documents[id]?.shared === true && documents[id]?.origin == null,
	);

	const renderRow = (doc: EditorDocument) => {
		const isActive = doc.id === activeDocumentId;
		return (
			<li key={doc.id}>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: row-level context menu; the interactive content is the buttons inside */}
				<div
					className={`dg-document-row${
						isActive ? " dg-document-row-active" : ""
					}`}
					onContextMenu={(event) => {
						event.preventDefault();
						setMenu({ x: event.clientX, y: event.clientY, doc });
					}}
				>
					<button
						type="button"
						className="dg-document-open"
						title={openDocumentIds.has(doc.id) ? "Focus editor" : "Open editor"}
						onClick={() => props.onOpen(doc.id)}
						onDoubleClick={() => rename(doc)}
					>
						{doc.dirty && <span className="dg-tab-dirty" />}
						{doc.title}
					</button>
					<button
						type="button"
						className="dg-document-delete"
						title={
							doc.dirty
								? "Discard document and its unsaved changes"
								: "Delete document"
						}
						onClick={() => remove(doc)}
					>
						<IconClose />
					</button>
				</div>
			</li>
		);
	};

	const ids = props.kind === "shared" ? shared : scratch;

	return (
		<div className="dg-documents">
			{ids.length === 0 ? (
				<p className="dg-sidebar-empty">
					{props.kind === "shared"
						? "No shared files yet. Shared files sync to every workspace member."
						: "No scratchpads yet. These stay local to your browser — experiments and adhoc queries are never shared."}
				</p>
			) : (
				<ul className="dg-document-list">
					{ids.map((id) => {
						const doc = documents[id];
						return doc === undefined ? null : renderRow(doc);
					})}
				</ul>
			)}
			{menu !== null && (
				<div
					className="dg-context-menu"
					role="menu"
					style={{ top: menu.y, left: menu.x }}
					onMouseDown={(event) => event.stopPropagation()}
				>
					<button
						type="button"
						className="dg-context-item"
						role="menuitem"
						onClick={() => {
							const doc = menu.doc;
							setMenu(null);
							rename(doc);
						}}
					>
						rename… <kbd>dbl click</kbd>
					</button>
					<button
						type="button"
						className="dg-context-item"
						role="menuitem"
						onClick={() => {
							const doc = menu.doc;
							setMenu(null);
							remove(doc);
						}}
					>
						delete
					</button>
				</div>
			)}
		</div>
	);
}
