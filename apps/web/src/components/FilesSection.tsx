import type { DatasourcePath } from "@datagripe/contracts";
import { type ReactNode, useState } from "react";
import { readIds, toggleId, writeIds } from "../persistence/idList";
import type { EditorDocument } from "../stores/documents";
import { DocumentSidebar } from "./DocumentSidebar";
import { IconChevronDown, IconChevronRight } from "./icons";
import { PathTree } from "./PathTree";

/**
 * Every file in one section (docs/spec/datasource-paths.md "What the
 * sidebar shows").
 *
 * The datasource's own directories, the project's shared files and this
 * browser's scratchpads used to be three sidebar sections and one of
 * them moved whenever a datasource changed. They are all "files the
 * editor can open", which is one question, so they are one tree with
 * three kinds of root — and a sidebar whose section list does not
 * change shape when you switch datasource.
 *
 * Creating belongs to the root it creates in: `new` sits on the row it
 * adds to, rather than in a header that has to name which list it meant.
 */

const ROOTS_KEY = "dg.sidebar.files";

export interface FilesSectionProps {
	connectionRef: string | null;
	paths: DatasourcePath[];
	onCreate: (shared: boolean, title: string) => void;
	onOpenDocument: (documentId: string) => void;
	onOpenFile: (doc: EditorDocument) => void;
	onDiscard: (documentId: string) => void;
}

export function FilesSection(props: FilesSectionProps) {
	const [openRoots, setOpenRoots] = useState<string[]>(() =>
		readIds(ROOTS_KEY),
	);
	/** The root whose `new` was pressed: its list has a row to type in. */
	const [naming, setNaming] = useState<"shared" | "scratch" | null>(null);

	const setOpen = (ids: string[]) => {
		setOpenRoots(ids);
		writeIds(ROOTS_KEY, ids);
	};

	const toggle = (id: string) => setOpen(toggleId(openRoots, id));

	/**
	 * Creating opens the root it creates in. A new file appearing in a
	 * folder you cannot see is indistinguishable from nothing happening
	 * — and the row asking for its name is in that folder.
	 */
	const nameIn = (id: "shared" | "scratch") => {
		if (!openRoots.includes(id)) {
			setOpen([...openRoots, id]);
		}
		setNaming(id);
	};

	const root = (options: {
		id: string;
		label: string;
		title?: string;
		create?: () => void;
		createLabel?: string;
		body: ReactNode;
	}) => {
		const open = openRoots.includes(options.id);
		return (
			<li key={options.id}>
				<div className="dg-tree-row dg-files-root">
					<button
						type="button"
						className="dg-path-row-button"
						aria-expanded={open}
						title={options.title}
						onClick={() => toggle(options.id)}
					>
						<span className="dg-tree-glyph" aria-hidden="true">
							{open ? <IconChevronDown /> : <IconChevronRight />}
						</span>
						<span className="dg-tree-label">{options.label}</span>
					</button>
					{options.create !== undefined && (
						<button
							type="button"
							className="dg-files-new"
							title={options.createLabel}
							aria-label={options.createLabel}
							onClick={options.create}
						>
							new
						</button>
					)}
				</div>
				{open && <div className="dg-files-root-body">{options.body}</div>}
			</li>
		);
	};

	return (
		<div className="dg-files">
			<ul className="dg-path-list">
				{/* The datasource's own directories first: they are the
					  project's files, and the two below them are DataGripe's. */}
				{props.connectionRef !== null &&
					props.paths.map((path) =>
						root({
							id: `path:${path.id}`,
							label: path.name,
							title: path.path,
							body: (
								<PathTree
									connectionRef={props.connectionRef ?? ""}
									path={path}
									onOpen={props.onOpenFile}
								/>
							),
						}),
					)}
				{root({
					id: "shared",
					label: "Workspace files",
					title: "Shared with every member of this project",
					create: () => nameIn("shared"),
					createLabel: "New shared file",
					body: (
						<DocumentSidebar
							kind="shared"
							creating={naming === "shared"}
							onCreate={(title) => {
								setNaming(null);
								props.onCreate(true, title);
							}}
							onCancelCreate={() => setNaming(null)}
							onOpen={props.onOpenDocument}
							onDiscard={props.onDiscard}
						/>
					),
				})}
				{root({
					id: "scratch",
					label: "Scratchpads",
					title: "Local to this browser — never shared",
					create: () => nameIn("scratch"),
					createLabel: "New scratchpad",
					body: (
						<DocumentSidebar
							kind="scratch"
							creating={naming === "scratch"}
							onCreate={(title) => {
								setNaming(null);
								props.onCreate(false, title);
							}}
							onCancelCreate={() => setNaming(null)}
							onOpen={props.onOpenDocument}
							onDiscard={props.onDiscard}
						/>
					),
				})}
			</ul>
		</div>
	);
}
