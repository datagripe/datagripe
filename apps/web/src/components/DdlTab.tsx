import { useEffect, useRef, useState } from "react";
import { wsClient } from "../api/ws";
import { monaco } from "../editor/monacoSetup";
import {
	editorFontSize,
	trackEditorScale,
	useAppearanceStore,
} from "../stores/appearance";
import { useObjectDraftsStore } from "../stores/objectDrafts";

/**
 * The definition tab, as an editor rather than a `<pre>`.
 *
 * A function's body is SQL, and it was the only SQL in the application
 * rendered without the tokenizer, the theme or the font every other
 * piece of SQL gets. Worse, it was the one place you could read a
 * definition and not change it — so the trip was: select the text, open
 * a scratchpad, paste, edit, run, come back.
 *
 * So it is editable, and **apply runs it as a statement**, down the same
 * path a query takes: the same role check, the same read-only refusal,
 * the same timeouts, the same row in the history under your name. The
 * result lands in the results panel, because that is where the outcome
 * of running something lives in this application and a second answer in
 * a third place would be a second thing to trust.
 *
 * Read-only datasources get a read-only editor. Not a disabled one with
 * a tooltip — reading a definition is most of what this tab is for.
 */

export interface DdlTabProps {
	viewId: string;
	connectionId: string;
	ddl: string;
	/** Reconstructed rather than exported, which PostgreSQL makes true. */
	reconstructed: boolean;
	/** The datasource refuses writes, whatever the role may do. */
	readOnly: boolean;
	/** Viewers may read a definition and not run one. */
	canApply: boolean;
	/** Re-read the object after a successful apply. */
	onApplied: () => void;
}

export function DdlTab(props: DdlTabProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const [draft, setDraft] = useState(props.ddl);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const setDirty = useObjectDraftsStore((state) => state.setDirty);

	const editable = !props.readOnly && props.canApply;
	const dirty = draft !== props.ddl;

	// The tab's dot comes from here: an object view has no document, so
	// nothing else knows this panel is holding an edit.
	useEffect(() => {
		setDirty(props.viewId, dirty);
	}, [props.viewId, dirty, setDirty]);
	useEffect(
		() => () => useObjectDraftsStore.getState().forget(props.viewId),
		[props.viewId],
	);

	/**
	 * One editor for the life of the panel. Creating it from the text or
	 * the read-only flag looked tidier and was wrong: every re-render that
	 * changed either tore the editor down and built another, and the one
	 * left mounted was not always the one with the model in it — an empty
	 * pane over a definition that had loaded perfectly.
	 */
	const initial = useRef(props.ddl);
	useEffect(() => {
		const host = hostRef.current;
		if (host === null) {
			return;
		}
		// React can hand a second instance of this component the same DOM
		// node — the panel re-mounts while the old editor's markup is still
		// inside it — and two editors in one host renders as an empty one.
		host.replaceChildren();
		// An explicit model with a URI of its own, the way the value editor
		// does it: two panels open on the same object are two editors, and
		// an auto-created model is a thing whose lifetime nobody owns.
		const model = monaco.editor.createModel(
			initial.current,
			"sql",
			monaco.Uri.parse(`inmemory://ddl/${crypto.randomUUID()}`),
		);
		const editor = monaco.editor.create(host, {
			model,
			theme: "datagripe-dark",
			automaticLayout: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			padding: { top: 8, bottom: 8 },
			fontSize: editorFontSize(13, useAppearanceStore.getState().scale),
			// A definition is read far more often than it is written, and
			// the pane is narrow.
			wordWrap: "on",
		});
		editorRef.current = editor;
		const untrackScale = trackEditorScale(editor, 13);
		const subscription = editor.onDidChangeModelContent(() => {
			setDraft(editor.getValue());
		});
		return () => {
			subscription.dispose();
			untrackScale();
			editor.dispose();
			model.dispose();
			editorRef.current = null;
		};
	}, []);

	// The object as the server last described it. A re-read after an
	// apply lands here, and replaces what is on screen — but only when it
	// actually differs, or every keystroke would fight the caret.
	useEffect(() => {
		const editor = editorRef.current;
		if (editor !== null && editor.getValue() !== props.ddl) {
			editor.setValue(props.ddl);
		}
		setDraft(props.ddl);
	}, [props.ddl]);

	useEffect(() => {
		editorRef.current?.updateOptions({
			readOnly: !editable,
			renderLineHighlight: editable ? "line" : "none",
		});
	}, [editable]);

	const apply = () => {
		setBusy(true);
		setError(null);
		void wsClient
			.request("execution.start", {
				connectionId: props.connectionId,
				sql: draft,
				idempotencyKey: crypto.randomUUID(),
			})
			.then(() => {
				// The results panel has the outcome; this tab's job is to stop
				// claiming an unsaved edit and to re-read what is now there.
				setDraft(props.ddl);
				props.onApplied();
			})
			.catch((cause: unknown) =>
				setError(
					cause instanceof Error ? cause.message : "Could not apply that",
				),
			)
			.finally(() => setBusy(false));
	};

	return (
		<div className="dg-ddl">
			{props.reconstructed && (
				<div className="dg-tree-note">
					Reconstructed from the catalog — PostgreSQL has no server-side DDL
					export, so this is accurate but not byte-for-byte what was executed.
				</div>
			)}
			<div className="dg-ddl-editor" ref={hostRef} />
			<div className="dg-ddl-bar">
				{!editable && (
					<span className="dg-ddl-note">
						{props.readOnly
							? "This datasource is read-only."
							: "Viewers cannot run statements."}
					</span>
				)}
				{editable && dirty && (
					<>
						<button
							type="button"
							className="dg-btn dg-btn-pri"
							disabled={busy}
							onClick={apply}
						>
							{busy ? "applying…" : "apply"}
						</button>
						<button
							type="button"
							className="dg-doc-new"
							disabled={busy}
							onClick={() => {
								setDraft(props.ddl);
								editorRef.current?.setValue(props.ddl);
							}}
						>
							revert
						</button>
						<span className="dg-ddl-note">
							Runs as a statement, like any other — history, limits and all.
						</span>
					</>
				)}
				{error !== null && <span className="dg-test-failed">{error}</span>}
			</div>
		</div>
	);
}
