import { type ReactNode, useState } from "react";
import { readIds, toggleId, writeIds } from "../persistence/idList";
import { IconChevronDown, IconChevronRight } from "./icons";

/**
 * The sidebar's stack of sections.
 *
 * Two rules, both of them about not moving: **every section starts
 * collapsed**, and a section stays where it is in the list whether it is
 * open or shut. An earlier version docked collapsed headers at the
 * bottom, which meant opening one re-ordered the sidebar around it —
 * the list you learned the shape of was never the list you were looking
 * at. Position is now a property of the section, not of its state.
 *
 * An open section sizes to its content, capped (.dg-sidebar-section in
 * index.css), and shrinks when space runs out; the explorer tree above
 * absorbs whatever is left.
 */

export interface SidebarSection {
	id: string;
	title: ReactNode;
	body: ReactNode;
	/**
	 * Controls that live in the header, where they work whether the
	 * section is open or shut — the MCP switch is the case this exists
	 * for. They sit beside the header button rather than inside it: a
	 * button in a button is neither valid nor clickable.
	 */
	actions?: ReactNode;
	/**
	 * Draw the whole section as switched on: a green frame that survives
	 * being collapsed, because "something outside this app can read the
	 * project" is not a fact that should need expanding a panel to see.
	 */
	on?: boolean;
}

/** Ids a person has opened. Everything else is collapsed.  */
const EXPANDED_KEY = "dg.sidebar.expanded";

export function SidebarSections(props: { sections: SidebarSection[] }) {
	const [expandedIds, setExpandedIds] = useState<string[]>(() =>
		readIds(EXPANDED_KEY),
	);

	const toggle = (id: string) => {
		const next = toggleId(expandedIds, id);
		setExpandedIds(next);
		writeIds(EXPANDED_KEY, next);
	};

	return (
		<>
			{props.sections.map((section) => {
				const open = expandedIds.includes(section.id);
				return (
					<section
						key={section.id}
						className={`dg-sidebar-section${open ? "" : " dg-sidebar-section-shut"}${
							section.on === true ? " dg-sidebar-section-on" : ""
						}`}
					>
						<div className="dg-section-head">
							<button
								type="button"
								className="dg-section-header"
								aria-expanded={open}
								onClick={() => toggle(section.id)}
							>
								<span className="dg-section-chevron">
									{open ? <IconChevronDown /> : <IconChevronRight />}
								</span>
								{section.title}
							</button>
							{section.actions !== undefined && (
								<div className="dg-section-actions">{section.actions}</div>
							)}
						</div>
						{open && (
							<div className="dg-sidebar-section-body dg-scroll">
								{section.body}
							</div>
						)}
					</section>
				);
			})}
		</>
	);
}
