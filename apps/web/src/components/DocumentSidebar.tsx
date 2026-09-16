import { useEffect, useState } from "react";
import type { EditorDocument } from "../stores/documents";
import { nextUntitledIndex, useDocumentsStore } from "../stores/documents";
import { useViewsStore } from "../stores/views";
import { IconClose } from "./icons";
import { NameInput } from "./NameInput";

export type DocumentSidebarProps = {
	/** Which list this renders; the tree root owns the heading and `new`. */
	kind: "shared" | "scratch";
	/** A `new` press on this root: the row to type a name into is here. */
	creating: boolean;
	onCreate: (title: string) => void;
	onCancelCreate: () => void;
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
 *
 * Naming happens in the row the file will occupy, on the way in and on
 * a rename. It used to be `window.prompt`, which is the browser's
 * dialog wearing the browser's font in the middle of an application
 * that has its own (roadmap: `ui · browser-chrome-in-an-app`) — and it
 * could not show what the name would become when it collides.
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
	/** The row being renamed in place. */
	const [renamingId, setRenamingId] = useState<string | null>(null);

	const remove = (doc: EditorDocument) => {
		if (
			!doc.dirty ||
			window.confirm(`Discard "${doc.title}" and its unsaved changes?`)
		) {
			props.onDiscard(doc.id);
		}
	};

	const revert = (doc: EditorDocument) => {
		if (
			window.confirm(
				`Throw away the unsaved changes to "${doc.title}" and go back to the last save?`,
			)
		) {
			void useDocumentsStore.getState().revertDocument(doc.id);
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
		if (renamingId === doc.id) {
			return (
				<li key={doc.id}>
					<NameInput
						initial={doc.title}
						aria-label={`Rename ${doc.title}`}
						onCommit={(title) => {
							setRenamingId(null);
							useDocumentsStore.getState().renameDocument(doc.id, title);
						}}
						onCancel={() => setRenamingId(null)}
					/>
				</li>
			);
		}
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
						onDoubleClick={() => setRenamingId(doc.id)}
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
	// The name a new file is offered, before anybody types: the same
	// `query-N.sql` an unnamed document has always been given.
	const suggested = `query-${nextUntitledIndex(
		order.map((id) => documents[id]?.title ?? ""),
	)}.sql`;

	return (
		<div className="dg-documents">
			{ids.length === 0 && !props.creating ? (
				<p className="dg-sidebar-empty">
					{props.kind === "shared"
						? "No shared files yet. Shared files sync to every workspace member."
						: "No scratchpads yet. These stay local to your browser — experiments and adhoc queries are never shared."}
				</p>
			) : (
				<ul className="dg-document-list">
					{props.creating && (
						<li key="new">
							<NameInput
								initial={suggested}
								aria-label={
									props.kind === "shared"
										? "Name the new shared file"
										: "Name the new scratchpad"
								}
								onCommit={props.onCreate}
								onCancel={props.onCancelCreate}
							/>
						</li>
					)}
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
							setRenamingId(doc.id);
						}}
					>
						rename… <kbd>dbl click</kbd>
					</button>
					{/* Only on a document that has something to throw away: an
						  offer to revert a saved file is an offer to do nothing. */}
					{menu.doc.dirty && (
						<button
							type="button"
							className="dg-context-item"
							role="menuitem"
							onClick={() => {
								const doc = menu.doc;
								setMenu(null);
								revert(doc);
							}}
						>
							revert to last save
						</button>
					)}
					<button
						type="button"
						className="dg-context-item dg-context-danger"
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
