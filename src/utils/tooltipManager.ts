import { App, TFile, setIcon, Notice } from "obsidian";
import { ZKNode } from "../view/indexView";

export class TooltipManager {
    private app: App;
    private tooltipEl: HTMLElement | null = null;
    private showTimeout: NodeJS.Timeout | null = null;
    private hideTimeout: NodeJS.Timeout | null = null;
    private currentTarget: EventTarget | null = null;
    private isHoveringTooltip: boolean = false;

    constructor(app: App) {
        this.app = app;
    }

    public attach(nodeElement: Element, nodeData: ZKNode) {
        // We use 'mouseenter' and 'mouseleave' for safer hover handling
        nodeElement.addEventListener('mouseenter', (e) => this.handleMouseEnter(e, nodeData));
        nodeElement.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
    }

    public destroy() {
        if (this.showTimeout) {
            clearTimeout(this.showTimeout);
            this.showTimeout = null;
        }
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        if (this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
        this.isHoveringTooltip = false;
        this.currentTarget = null;
    }

    private handleMouseEnter(event: Event, nodeData: ZKNode) {
        this.currentTarget = event.target;

        // If we are scheduled to hide, cancel it (bridge logic)
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
            // If tooltip is already fading out, restore it?
            // For now, if it's visible, just keep it visible.
            if (this.tooltipEl) {
                this.tooltipEl.style.opacity = "1";
                this.tooltipEl.style.transition = "none"; // Stop fade out immediately
                return; 
            }
        }

        // Schedule show
        if (!this.tooltipEl) {
            this.showTimeout = setTimeout(() => {
                this.createTooltip(event as MouseEvent, nodeData);
            }, 1500); // 1.5s delay
        }
    }

    private handleMouseLeave(event: Event) {
        // Cancel show if pending
        if (this.showTimeout) {
            clearTimeout(this.showTimeout);
            this.showTimeout = null;
        }

        // Schedule hide (bridge)
        if (this.tooltipEl) {
            this.hideTimeout = setTimeout(() => {
                if (!this.isHoveringTooltip) {
                    this.startFadeOut();
                }
            }, 200); // 200ms bridge
        }
    }

    private createTooltip(event: MouseEvent, nodeData: ZKNode) {
        if (this.tooltipEl) return;

        this.tooltipEl = document.body.createDiv({ cls: 'zk-node-tooltip' });
        
        // Position roughly near the node. 
        // Since we are in D3, the event target is an SVG element.
        // We can get its bounding client rect.
        const targetEl = event.target as Element;
        const rect = targetEl.getBoundingClientRect();
        
        // Position: Bottom Right of the node
        this.tooltipEl.style.left = `${rect.right + 5}px`;
        this.tooltipEl.style.top = `${rect.bottom + 5}px`;

        // Add content
        this.renderContent(nodeData);

        // Handle mouse enter/leave on tooltip itself (for bridge)
        this.tooltipEl.addEventListener('mouseenter', () => {
            this.isHoveringTooltip = true;
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            if (this.tooltipEl) {
                this.tooltipEl.style.opacity = "1";
                this.tooltipEl.style.transition = "none";
            }
        });

        this.tooltipEl.addEventListener('mouseleave', () => {
            this.isHoveringTooltip = false;
            this.hideTimeout = setTimeout(() => {
                this.startFadeOut();
            }, 200);
        });
    }

    private renderContent(node: ZKNode) {
        if (!this.tooltipEl) return;

        // Title
        const titleEl = this.tooltipEl.createDiv({ cls: 'zk-tooltip-title' });
        titleEl.textContent = node.title;

        // ID + Copy Button
        const idRow = this.tooltipEl.createDiv({ cls: 'zk-tooltip-id-row' });
        
        // Scrollable container for ID
        const scrollContainer = idRow.createDiv({ cls: 'zk-id-scroll-container' });
        scrollContainer.createSpan({ cls: 'zk-id-text', text: `ID: ${node.ID}` });

        const copyBtn = idRow.createEl('button', { cls: 'zk-tooltip-copy-btn' });
        setIcon(copyBtn, 'copy');
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(node.ID);
            new Notice(`Copied ID: ${node.ID}`);
        };

        // Frontmatter Properties
        const cache = this.app.metadataCache.getFileCache(node.file);
        if (cache && cache.frontmatter) {
            const fmContainer = this.tooltipEl.createDiv({ cls: 'zk-tooltip-frontmatter' });
            for (const [key, value] of Object.entries(cache.frontmatter)) {
                if (key === 'position') continue; // Skip internal obsidian position
                // Skip ID and title if they are already shown, but user said "all attributes"
                // Let's just show everything from frontmatter to be safe, except maybe internal ones.
                
                const row = fmContainer.createDiv({ cls: 'zk-tooltip-fm-row' });
                row.createSpan({ cls: 'zk-tooltip-fm-key', text: `${key}: ` });
                row.createSpan({ cls: 'zk-tooltip-fm-val', text: String(value) });
            }
        }
    }

    private startFadeOut() {
        if (!this.tooltipEl) return;

        // 2.0s fade out
        this.tooltipEl.style.transition = "opacity 2.0s ease-out";
        this.tooltipEl.style.opacity = "0";

        // Remove from DOM after transition
        setTimeout(() => {
            // Check if we cancelled the hide during transition
            if (this.tooltipEl && this.tooltipEl.style.opacity === "0") {
                this.tooltipEl.remove();
                this.tooltipEl = null;
            }
        }, 2000);
    }
}
