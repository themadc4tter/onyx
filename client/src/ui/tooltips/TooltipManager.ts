export type TooltipTone = "default" | "common" | "uncommon" | "rare" | "ability" | "perk" | "warning";
export type TooltipTextTone = "normal" | "muted" | "good" | "bad" | "warning";

export interface TooltipTextRow {
  kind: "text";
  text: string;
  tone?: TooltipTextTone;
}

export interface TooltipStatRow {
  kind: "stat";
  label: string;
  value: string;
  tone?: TooltipTextTone;
}

export type TooltipRow = TooltipTextRow | TooltipStatRow;

export interface TooltipSection {
  rows: TooltipRow[];
}

export interface TooltipContent {
  title: string;
  subtitle?: string;
  iconUrl?: string;
  tone?: TooltipTone;
  description?: string;
  sections?: TooltipSection[];
  footer?: string;
}

export type TooltipContentProvider = () => TooltipContent | null | undefined;

const TOOLTIP_OFFSET_PX = 16;
const TOOLTIP_MARGIN_PX = 8;

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export class TooltipManager {
  private static nextId = 1;

  private element: HTMLDivElement;
  private activeTarget: HTMLElement | null = null;
  private previousDescribedBy: string | null = null;
  private lastPointerPosition: { clientX: number; clientY: number } | null = null;

  constructor(
    private root: HTMLElement,
    private getViewportBounds: () => DOMRect,
  ) {
    this.element = document.createElement("div");
    this.element.id = `hud-tooltip-${TooltipManager.nextId}`;
    TooltipManager.nextId += 1;
    this.element.className = "hud-tooltip";
    this.element.setAttribute("role", "tooltip");
    this.element.hidden = true;
    this.root.appendChild(this.element);
  }

  attach(target: HTMLElement, provider: TooltipContentProvider) {
    target.removeAttribute("title");

    const showFromPointer = (event: PointerEvent) => {
      this.lastPointerPosition = { clientX: event.clientX, clientY: event.clientY };
      this.show(target, provider, this.lastPointerPosition);
    };

    const moveWithPointer = (event: PointerEvent) => {
      this.lastPointerPosition = { clientX: event.clientX, clientY: event.clientY };
      if (this.activeTarget === target && !this.element.hidden) {
        this.positionAt(this.lastPointerPosition.clientX, this.lastPointerPosition.clientY);
      }
    };

    const showFromFocus = () => {
      const rect = target.getBoundingClientRect();
      this.show(target, provider, {
        clientX: rect.left + rect.width / 2,
        clientY: rect.bottom,
      });
    };

    const hide = () => {
      if (this.activeTarget === target) this.hide();
    };

    const hideOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.activeTarget === target) this.hide();
    };

    target.addEventListener("pointerenter", showFromPointer);
    target.addEventListener("pointermove", moveWithPointer);
    target.addEventListener("pointerleave", hide);
    target.addEventListener("focus", showFromFocus);
    target.addEventListener("blur", hide);
    target.addEventListener("keydown", hideOnEscape);
  }

  hide() {
    if (this.activeTarget) {
      if (this.previousDescribedBy) {
        this.activeTarget.setAttribute("aria-describedby", this.previousDescribedBy);
      } else {
        this.activeTarget.removeAttribute("aria-describedby");
      }
    }

    this.activeTarget = null;
    this.previousDescribedBy = null;
    this.lastPointerPosition = null;
    this.element.hidden = true;
    this.element.replaceChildren();
  }

  destroy() {
    this.hide();
    this.element.remove();
  }

  private show(
    target: HTMLElement,
    provider: TooltipContentProvider,
    position: { clientX: number; clientY: number },
  ) {
    const content = provider();
    if (!content) {
      this.hide();
      return;
    }

    if (this.activeTarget !== target) {
      this.hide();
      this.activeTarget = target;
      this.previousDescribedBy = target.getAttribute("aria-describedby");
      target.setAttribute("aria-describedby", this.element.id);
    }

    this.renderContent(content);
    this.element.hidden = false;
    this.element.style.visibility = "hidden";
    this.positionAt(position.clientX, position.clientY);
    this.element.style.visibility = "";
  }

  private positionAt(clientX: number, clientY: number) {
    const rootRect = this.root.getBoundingClientRect();
    const bounds = this.getViewportBounds();
    const tooltipRect = this.element.getBoundingClientRect();

    let left = clientX + TOOLTIP_OFFSET_PX;
    let top = clientY + TOOLTIP_OFFSET_PX;

    if (left + tooltipRect.width + TOOLTIP_MARGIN_PX > bounds.right) {
      left = clientX - tooltipRect.width - TOOLTIP_OFFSET_PX;
    }

    if (top + tooltipRect.height + TOOLTIP_MARGIN_PX > bounds.bottom) {
      top = clientY - tooltipRect.height - TOOLTIP_OFFSET_PX;
    }

    left = clamp(left, bounds.left + TOOLTIP_MARGIN_PX, bounds.right - tooltipRect.width - TOOLTIP_MARGIN_PX);
    top = clamp(top, bounds.top + TOOLTIP_MARGIN_PX, bounds.bottom - tooltipRect.height - TOOLTIP_MARGIN_PX);

    this.element.style.left = `${Math.round(left - rootRect.left)}px`;
    this.element.style.top = `${Math.round(top - rootRect.top)}px`;
  }

  private renderContent(content: TooltipContent) {
    this.element.className = `hud-tooltip tone-${content.tone ?? "default"}`;
    this.element.replaceChildren();

    const header = document.createElement("div");
    header.className = "hud-tooltip-header";

    if (content.iconUrl) {
      const icon = document.createElement("img");
      icon.className = "hud-tooltip-icon";
      icon.src = content.iconUrl;
      icon.alt = "";
      header.appendChild(icon);
    }

    const titleGroup = document.createElement("div");
    titleGroup.className = "hud-tooltip-title-group";

    const title = document.createElement("div");
    title.className = "hud-tooltip-title";
    title.textContent = content.title;
    titleGroup.appendChild(title);

    if (content.subtitle) {
      const subtitle = document.createElement("div");
      subtitle.className = "hud-tooltip-subtitle";
      subtitle.textContent = content.subtitle;
      titleGroup.appendChild(subtitle);
    }

    header.appendChild(titleGroup);
    this.element.appendChild(header);

    if (content.description) {
      const description = document.createElement("div");
      description.className = "hud-tooltip-description";
      description.textContent = content.description;
      this.element.appendChild(description);
    }

    for (const section of content.sections ?? []) {
      if (section.rows.length === 0) continue;

      const sectionEl = document.createElement("div");
      sectionEl.className = "hud-tooltip-section";

      for (const row of section.rows) {
        if (row.kind === "text") {
          const text = document.createElement("div");
          text.className = `hud-tooltip-text tone-${row.tone ?? "normal"}`;
          text.textContent = row.text;
          sectionEl.appendChild(text);
          continue;
        }

        const stat = document.createElement("div");
        stat.className = `hud-tooltip-stat tone-${row.tone ?? "normal"}`;

        const label = document.createElement("span");
        label.className = "hud-tooltip-stat-label";
        label.textContent = row.label;

        const value = document.createElement("strong");
        value.className = "hud-tooltip-stat-value";
        value.textContent = row.value;

        stat.append(label, value);
        sectionEl.appendChild(stat);
      }

      this.element.appendChild(sectionEl);
    }

    if (content.footer) {
      const footer = document.createElement("div");
      footer.className = "hud-tooltip-footer";
      footer.textContent = content.footer;
      this.element.appendChild(footer);
    }
  }
}
