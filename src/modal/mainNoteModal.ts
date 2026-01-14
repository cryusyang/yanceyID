import ZKNavigationPlugin from "main";
import { App, FuzzySuggestModal, Notice, SuggestModal, renderMatches } from "obsidian";
import { t } from "src/lang/helper";
import { ZKNode } from "src/view/indexView";

// Helper to ensure consistency between search text and render offset
const SEPARATOR = ": ";
function getFullSearchText(node: ZKNode): string {
    return `${node.ID}${SEPARATOR}${node.title}`;
}

export class mainNoteModal extends SuggestModal<ZKNode>{
    selectZKNode: ZKNode
    onSubmit: (selectZKNode: ZKNode) => void;
    plugin: ZKNavigationPlugin;
    MainNotes: ZKNode[];
    query: string;
  
    constructor(app: App, plugin: ZKNavigationPlugin, MainNotes: ZKNode[], onSubmit: (selectZKNode: ZKNode) => void) {
      super(app);
      this.onSubmit = onSubmit;
      this.plugin = plugin;
      this.MainNotes = MainNotes;
      this.setPlaceholder(t("select a main note"));
      this.limit = plugin.settings.maxLenMainModel;
    }

    getSuggestions(query: string):ZKNode[] {
      let mainNotes:ZKNode[] = [];
      this.query = query;
      // Search in both ID and Title
      mainNotes = this.MainNotes.filter(node => node.ID.toLowerCase().startsWith(query.toLowerCase()) 
      || node.title.toLowerCase().startsWith(query.toLowerCase()));
      
      return mainNotes;
    }

    renderSuggestion(node: ZKNode, el:HTMLElement) {
      // ONLY show the title, do NOT show the ID
      const displayText = node.title;
      
      const matches: [number, number][] = [];
      const queryLower = this.query.toLowerCase();
      const titleLower = node.title.toLowerCase();
      
      // Only highlight if the query matches the title prefix
      if (titleLower.startsWith(queryLower)) {
          matches.push([0, queryLower.length]);
      }
      // If query matches ID but not title, we show title without highlight
      
      renderMatches(el, displayText, matches);
    }

    onChooseSuggestion(node: ZKNode, evt: MouseEvent | KeyboardEvent) {
      this.selectZKNode = node;
      this.onSubmit(this.selectZKNode);
    }
}

export class mainNoteFuzzyModal extends FuzzySuggestModal<ZKNode> {

    selectZKNode: ZKNode
    onSubmit: (selectZKNode: ZKNode) => void;
    plugin: ZKNavigationPlugin;
    MainNotes: ZKNode[];
  
    constructor(app: App, plugin: ZKNavigationPlugin, MainNotes: ZKNode[], onSubmit: (selectZKNode: ZKNode) => void) {
      super(app);
      this.onSubmit = onSubmit;
      this.plugin = plugin;
      this.MainNotes = MainNotes;
      this.setPlaceholder(t("select a main note"));
      this.limit = plugin.settings.maxLenMainModel;
    }
  
    getItems(): ZKNode[] {
      return this.MainNotes;
    }
  
    getItemText(node: ZKNode): string {
      // Include ID in the search text so users can search by ID
      return getFullSearchText(node);
    }

    renderSuggestion(item: any, el: HTMLElement) {
        // item is FuzzyMatch<ZKNode>
        const node = item.item as ZKNode;
        const match = item.match;
        
        // ONLY show the title
        const displayText = node.title;
        
        // Calculate offset to map matches from "ID: Title" back to "Title"
        // ID part is `node.ID` + `: `
        const prefixLength = node.ID.length + SEPARATOR.length;
        
        const titleMatches: [number, number][] = [];
        
        if (match && match.matches) {
            for (const range of match.matches) {
                const start = range[0];
                const end = range[1];
                
                // We only care about matches that occur within the title part
                const validStart = Math.max(start, prefixLength);
                const validEnd = Math.max(end, prefixLength);
                
                if (validEnd > validStart) {
                    // Shift indices to be relative to the title start
                    titleMatches.push([validStart - prefixLength, validEnd - prefixLength]);
                }
            }
        }

        renderMatches(el, displayText, titleMatches);
    }
  
    onChooseItem(selectZKNode: ZKNode, evt: MouseEvent | KeyboardEvent) {
      this.selectZKNode = selectZKNode;
      this.onSubmit(this.selectZKNode);
    }
  }
