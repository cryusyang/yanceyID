import ZKNavigationPlugin from "main";
import { App, FuzzySuggestModal, Notice, SuggestModal, renderMatches } from "obsidian";
import { t } from "src/lang/helper";
import { ZKNode } from "src/view/indexView";

export interface ZKIndex {
  keyword: string,
  display: string,
  path: string,
}

export class indexModal extends SuggestModal<ZKIndex> {
  index: ZKIndex;
  onSubmit: (index: ZKIndex) => void;
  ALL_ZKIndex: ZKIndex[];
  plugin: ZKNavigationPlugin;
  query: string
  MainNotes: ZKNode[];

  constructor(app: App, plugin: ZKNavigationPlugin, MainNotes: ZKNode[], onSubmit: (index: ZKIndex) => void) {
    super(app);
    this.onSubmit = onSubmit;
    this.plugin = plugin;
    this.MainNotes = MainNotes;
    this.setPlaceholder(t("select an index"));
    this.limit = plugin.settings.maxLenIndexModel;
  }

  // Returns all available suggestions.
  getSuggestions(query: string): ZKIndex[] {
    this.ALL_ZKIndex = [];
    this.query = query

    const indexPath = this.plugin.settings.FolderOfIndexes;

    if (indexPath == "") {
      new Notice(t("Index folder not set!"));
    } else {

      // Get all indexes
      const indexFiles = this.app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(indexPath + '/'));

      if (indexFiles.length == 0) {
        new Notice(`${t("No index can be found by path")} "${indexPath}"`)
      }

      // Get outlinks from index
      const resolvedLinks = this.app.metadataCache.resolvedLinks;

      for (let file of indexFiles) {
        let frontLinks: string[] = Object.keys(resolvedLinks[file.path])
          .filter(l => l.endsWith("md"));

        let outlinks:string[] = [];

        if (frontLinks.length > 0) {
          for (let link of frontLinks) {
           let file = this.app.vault.getFileByPath(link);
           if(file !== null){              
              let outlink = this.MainNotes.find(n=>n.file === file);
              if(typeof outlink !== 'undefined'){
                let count = this.MainNotes.filter(n=>n.IDStr.startsWith(outlink!.IDStr)).length
                outlinks.push(outlink.ID+` (${count.toString()})`);
              }else{
                outlinks.push(file.basename);
              }
           }
          }
        }

        this.ALL_ZKIndex.push({ keyword: file.basename, display: `【${file.basename}】: ${outlinks.toString()}`, path:file.path })
      }

      this.ALL_ZKIndex.sort(function (a, b) {
        return a['keyword'].localeCompare(b['keyword'])
      });

    }

    this.ALL_ZKIndex = this.ALL_ZKIndex.filter(i => i.keyword.toLowerCase().startsWith(query.toLowerCase()));

    return this.ALL_ZKIndex;
  }

  renderSuggestion(index: ZKIndex, el: HTMLElement) {
    //el.createEl('div', { text: index.display });
    renderMatches(el, index.display, [[0, this.query.length + 1]]);
  }

  onChooseSuggestion(index: ZKIndex, evt: MouseEvent | KeyboardEvent) {
    this.index = index;
    this.onSubmit(this.index);
  }
}

export class indexFuzzyModal extends FuzzySuggestModal<ZKIndex> {

  index: ZKIndex;
  onSubmit: (index: ZKIndex) => void;
  ALL_ZKIndex: ZKIndex[];
  plugin: ZKNavigationPlugin;
  MainNotes: ZKNode[];

  constructor(app: App, plugin: ZKNavigationPlugin, MainNotes: ZKNode[], onSubmit: (index: ZKIndex) => void) {
    super(app);
    this.onSubmit = onSubmit;
    this.plugin = plugin;
    this.MainNotes = MainNotes;
    this.setPlaceholder(t("select an index"));
    this.limit = plugin.settings.maxLenIndexModel;
  }

  getItems(): ZKIndex[] {

    this.ALL_ZKIndex = [];

    const indexPath = this.plugin.settings.FolderOfIndexes;

    if (indexPath == "") {
      new Notice(t("Index folder not set!"));
    } else {

      // Get all indexes
      const indexFiles = this.app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(indexPath + '/'));

      if (indexFiles.length == 0) {
        new Notice(`${t("No index can be found by path")} "${indexPath}"`)
      }

      // Get outlinks from index
      const resolvedLinks = this.app.metadataCache.resolvedLinks;

      for (let file of indexFiles) {
        let frontLinks: string[] = Object.keys(resolvedLinks[file.path])
          .filter(l => l.endsWith("md"));

        let outlinks:string[] = [];
        
        if (frontLinks.length > 0) {
          for (let link of frontLinks) {
           let file = this.app.vault.getFileByPath(link);
           if(file !== null){              
              let outlinkArr = this.MainNotes.filter(n=>n.file === file);
              if(outlinkArr.length > 0){
                for(let outlink of outlinkArr){
                  let count = this.MainNotes.filter(n=>n.IDStr.startsWith(outlink!.IDStr)).length;
                  outlinks.push(outlink.ID+` (${count.toString()})`);
                }
              }else{
                outlinks.push(file.basename);
              }
           }
          }
        }

        this.ALL_ZKIndex.push({ keyword: file.basename, display: `【${file.basename}】: ${outlinks.toString()}`, path:file.path })
      }

      this.ALL_ZKIndex.sort(function (a, b) {
        return a['keyword'].localeCompare(b['keyword'])
      });

    }

    return this.ALL_ZKIndex;
  }

  getItemText(index: ZKIndex): string {
    return index.display;
  }

  renderSuggestion(item: any, el: HTMLElement) {
    const index = item.item as ZKIndex;
    const match = item.match;
    
    const displayText = index.keyword;
    // index.display format: `【${file.basename}】: ...`
    // We want to extract matches corresponding to file.basename which starts at index 1
    const offset = 1;
    const limit = offset + displayText.length;

    const titleMatches: [number, number][] = [];
    
    if (match && match.matches) {
        for (const range of match.matches) {
            // Check if the match falls within the keyword part (between 【 and 】)
            // range is [start, end)
            // We need intersection of [range[0], range[1]] and [offset, limit]
            
            const start = Math.max(range[0], offset);
            const end = Math.min(range[1], limit);
            
            if (end > start) {
                // Shift back to 0-based index for keyword
                titleMatches.push([start - offset, end - offset]);
            }
        }
    }

    renderMatches(el, displayText, titleMatches);
  }

  onChooseItem(index: ZKIndex, evt: MouseEvent | KeyboardEvent) {
    
    this.index = index;
    this.onSubmit(this.index);
  }
}