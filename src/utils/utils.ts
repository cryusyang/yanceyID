import ZKNavigationPlugin, { ZoomPanScale } from "main";
import { loadMermaid, moment, Notice, TFile } from "obsidian";
import { ZKNode } from "src/view/indexView";

// formatting YanceyID style IDs
export function ID_formatting(id: string): string[] {
    const segments = id.split('/');
    const formattedSegments: string[] = [];

    for (const seg of segments) {
        if (!seg) continue;

        // Check if segment starts with a digit (potential YanceyID numeric segment)
        if (/^\d/.test(seg)) {
            // Extract number and potential suffix
            // e.g. "100", "00100", "100m", "00100mm"
            const match = seg.match(/^(\d+)([a-zA-Z]*)$/);
            if (match) {
                const numPart = match[1];
                const suffixPart = match[2];
                // Pad number to 5 digits
                const paddedNum = numPart.padStart(5, '0');
                formattedSegments.push(paddedNum + suffixPart);
            } else {
                formattedSegments.push(seg);
            }
        } else {
            // Not starting with digit -> Topic (e.g. "english")
            formattedSegments.push(seg);
        }
    }
    return formattedSegments;
}

// translating different ID fields(filename/attribute/prefix of filename) into standard ZKNode array
export async function mainNoteInit(plugin:ZKNavigationPlugin){

    let mainNoteFiles:TFile[] = this.app.vault.getFiles();

    if(plugin.settings.MainNoteExt == 'md'){
        mainNoteFiles = mainNoteFiles.filter(file=>file.extension == "md");
    }

    //clear our folder field
    if(plugin.settings.FolderOfMainNotes !== "" ){
        plugin.settings.FolderList.push(plugin.settings.FolderOfMainNotes);
        plugin.settings.FolderOfMainNotes = "";
    }

    if(plugin.settings.FolderList.length > 0){

        let validFolders = [...new Set(plugin.settings.FolderList)].filter(folder => folder !== "");

        let tempMainNoteFiles:TFile[] = [];

        for(let i=0;i<validFolders.length;i++){

            if(validFolders[i] === '/'){
                tempMainNoteFiles.push(...mainNoteFiles.filter(file => file.parent && file.parent.name === ""))

            }else{
                tempMainNoteFiles.push(...mainNoteFiles.filter(
                    file => {
                        return file.path.replace(file.name, "").startsWith(validFolders[i] + '/');
                    }))
            }
        }
        mainNoteFiles = uniqueByTFile(tempMainNoteFiles);
    }

    if (plugin.settings.TagOfMainNotes !== '') {
        
        let mdMainNote:TFile[] = [];
        let otherMainNote:TFile[]=[];

        if(plugin.settings.MainNoteExt == 'all'){
            otherMainNote =  mainNoteFiles.filter( file => file.extension !== "md");
        }
        
        mdMainNote = mainNoteFiles.filter(
            file => file.extension == 'md' && getfileTags(file).includes(plugin.settings.TagOfMainNotes)
        )
        mainNoteFiles = mdMainNote.concat(otherMainNote);
    }

    plugin.MainNotes = [];

    for (let note of mainNoteFiles) {
        let IDArr: string[] = [];

        let node: ZKNode = {
            ID: '',
            IDArr: IDArr,
            IDStr: '',
            position: 0,
            file: note,
            title: '',
            displayText: '',
            ctime: 0,
            randomId: random(16),
            nodeSons:1,
            startY:0,
            height:0,
            isRoot: false,
            fixWidth: 0,
            branchName: "",
            gitNodePos: 0,
        }

        let nodeCache = this.app.metadataCache.getFileCache(note);

        if (node.file.extension == 'md') {
            if (nodeCache !== null) {
                if (typeof nodeCache.frontmatter !== 'undefined' && plugin.settings.IDField !== "") {
                    let id = nodeCache.frontmatter[plugin.settings.IDField];
                    if (Array.isArray(id)) {
                        if (id[0] === null) {
                            continue;
                        }
                        node.ID = id[0].toString();
                        node.IDArr = ID_formatting(node.ID);
                        node.IDStr = node.IDArr.toString();
                        node.title = note.basename;
                    } else if (typeof id == "string") {
                        node.ID = id;
                        node.IDArr = ID_formatting(node.ID);
                        node.IDStr = node.IDArr.toString();
                        node.title = note.basename;
                    } else if (typeof id == 'number') {
                        node.ID = id.toString();
                        node.IDArr = ID_formatting(node.ID);
                        node.IDStr = node.IDArr.toString();
                        node.title = note.basename;
                    }
                }
            }
            if (node.ID == '') {
                continue;
            }
        }
        
        if (plugin.settings.CustomCreatedTime.length > 0 && node.file.extension == 'md') {
            
           let ctime = nodeCache?.frontmatter?.[plugin.settings.CustomCreatedTime];

           if(ctime){
                let time = moment(ctime);
                if(time.isValid()){
                    node.ctime = time.valueOf();
                }
           }            
        }

        if(node.ctime === 0){         
            node.ctime = node.file.stat.ctime         
        }

        plugin.MainNotes.push(node);
    }

    plugin.MainNotes = plugin.MainNotes.filter(n=>n.IDArr.length > 0);

    if(plugin.settings.multiIDToggle == true && plugin.settings.multiIDField != ''){
        
        let duplicateNodes:ZKNode[] = [];

        for (let i = 0; i < plugin.MainNotes.length; i++) {
            let node = plugin.MainNotes[i];
            if(node.file.extension == 'md'){
                let fm = await this.app.metadataCache.getFileCache(node.file).frontmatter;
                if(fm){
                    let IDs = fm[plugin.settings.multiIDField];
                    if(Array.isArray(IDs)){
                        for(let j = 0; j < IDs.length; j++){
                            if (IDs[j] === null) {
                                continue;
                            }
                            let nodeDup =  Object.assign({}, node);
                            nodeDup.ID = IDs[j].toString();
                            nodeDup.IDArr = ID_formatting(nodeDup.ID);
                            nodeDup.IDStr = nodeDup.IDArr.toString();
                            nodeDup.randomId = random(16);
                            duplicateNodes.push(nodeDup)
                        }
                    }else if(typeof IDs == "string"){
                        let nodeDup =  Object.assign({}, node);
                        nodeDup.ID = IDs;
                        nodeDup.IDArr = ID_formatting(nodeDup.ID);
                        nodeDup.IDStr = nodeDup.IDArr.toString();
                        nodeDup.randomId = random(16);
                        duplicateNodes.push(nodeDup)
                    }
                }
            }
        }
        if(duplicateNodes.length > 0){
            plugin.MainNotes.push(...duplicateNodes);
            plugin.MainNotes = uniqueByZKNote(plugin.MainNotes);
        }
    }

    plugin.MainNotes.sort((a, b) => a.IDStr.localeCompare(b.IDStr));

    for (let i = 0; i < plugin.MainNotes.length; i++) {
        let node = plugin.MainNotes[i];
        node.position = i;
        if(!plugin.MainNotes.find(n=>n.IDArr.toString() == node.IDArr.slice(0,-1).toString())){
            node.isRoot = true;
        }
        
        switch (plugin.settings.NodeText) {
            case "id":
                node.displayText = node.ID;
                break;
            case "title":
                if (node.title == "") {
                    node.displayText = node.ID;
                } else {
                    node.displayText = node.title;
                }
                break;
            case "both":
                node.displayText = `${node.ID}: ${node.title}`;
                break;
            default:
            //do nothing
        }
    }
}

export const random = (e: number) => {
	let t = [];
	for (let n = 0; n < e; n++) {
		t.push((16 * Math.random() | 0).toString(16));
	}
	return t.join("");
};


function uniqueByZKNote(arr: ZKNode[]) {
    const map = new Map();
    const result = [];
    for (const item of arr) {
      const compoundKey = item.ID + '_' + item.file.path;
      if (!map.has(compoundKey)) {
        map.set(compoundKey, true);
        result.push(item);
      }
    }
    return result;
}

function uniqueByTFile(arr: TFile[]) {
    const map = new Map();
    const result = [];
    for (const item of arr) {
      const compoundKey = item.path;
      if (!map.has(compoundKey)) {
        map.set(compoundKey, true);
        result.push(item);
      }
    }
    return result;
}


export function displayWidth(str:string){
    let length = 0;
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        length += charCode >= 0 && charCode <= 128 ? 1 : 2;
    }
    return length;
}

export async function addSvgPanZoom(
    zkGraph:HTMLDivElement, 
    indexMermaidDiv: HTMLElement, 
    i:number, 
    plugin:ZKNavigationPlugin, 
    mermaidStr:string, height:number){
    
    const mermaid = await loadMermaid();
    let { svg } = await mermaid.render(`${zkGraph.id}-svg`, mermaidStr);
            
    zkGraph.insertAdjacentHTML('beforeend', svg);
    
    if(plugin.settings.graphType === "roadmap"){
        zkGraph.children[0].removeAttribute('style');
    }
    
    zkGraph.children[0].addClass("zk-full-width");

    zkGraph.children[0].setAttr('height', `${height}px`); 
    
    indexMermaidDiv.appendChild(zkGraph);

    const svgPanZoom = require("svg-pan-zoom");
            
    let panZoomTiger = await svgPanZoom(`#${zkGraph.id}-svg`, {
        zoomEnabled: true,
        controlIconsEnabled: false,
        fit: true,                    
        center: true,
        minZoom: 0.001,
        maxZoom: 1000,
        dblClickZoomEnabled: false,
        zoomScaleSensitivity: 0.2,
        
        onZoom: async () => {                        
            plugin.settings.zoomPanScaleArr[i].zoomScale = panZoomTiger.getZoom();

        },
        onPan: async ()=> {
            plugin.settings.zoomPanScaleArr[i].pan = panZoomTiger.getPan();
            
        }
    })

    const touchSvg = document.getElementById(`${zkGraph.id}-svg`);

    if(touchSvg !== null){
        let startDistance:number = 0;
        let scale = panZoomTiger.getZoom();
        let lastScale = scale;

        touchSvg.addEventListener('touchstart', (event)=>{
            if(event.touches.length === 2){
                let touch1 = event.touches[0];
                let touch2 = event.touches[1];
                startDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
            }
        })

        touchSvg.addEventListener('touchmove', (event)=>{
            if(event.touches.length === 2){
                let touch1 = event.touches[0];
                let touch2 = event.touches[1];
                let currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);               
                let newScale = currentDistance / startDistance;
                scale = scale * newScale / lastScale;
                panZoomTiger.zoom(scale);
            }
        })
    }

    if(typeof plugin.settings.zoomPanScaleArr[i] === 'undefined'){
        
        const setSvg = document.getElementById(`${zkGraph.id}-svg`);
        
        if(setSvg !== null){
            let a = setSvg.children[0].getAttr("style");
            if(a){                
                let b = a.match(/\d([^\,]+)\d/g)                
                if(b !== null && Number(b[0]) > 1){
                    panZoomTiger.zoom(1/Number(b[0]))
                }                        
            }
            let zoomPanScale: ZoomPanScale = {
                graphID: zkGraph.id,
                zoomScale: panZoomTiger.getZoom(),
                pan: panZoomTiger.getPan(),
            };

            plugin.settings.zoomPanScaleArr.push(zoomPanScale);
        }

    }else{
        panZoomTiger.zoom(plugin.settings.zoomPanScaleArr[i].zoomScale);  
        panZoomTiger.pan(plugin.settings.zoomPanScaleArr[i].pan); 
                
    }  
}

function getfileTags(file:TFile){
    let fileTags:string[] = [];
    let fmTags = this.app.metadataCache.getFileCache(file)?.frontmatter?.tags;
    	if(fmTags){
		if(Array.isArray(fmTags)){
		
			for(let tag of fmTags){
				splitNestedTags("#" + tag, fileTags);
			}
			
		}else if(typeof fmTags == "string"){
			splitNestedTags("#" + fmTags, fileTags);			
		}else{
		}
	}

    let tags = this.app.metadataCache.getFileCache(file)?.tags
	
	if(tags && Array.isArray(tags)){

		for(let tag of tags){
			splitNestedTags(tag.tag, fileTags);
		}
	}

    return fileTags;
}

function splitNestedTags(nestTag:string, arr:string[]){
	let words = nestTag.split("/");
	let tagStr = "";
	for(let word of words){
		tagStr = tagStr.concat(word);
		arr.push(tagStr);
		tagStr = tagStr.concat("/");
	}
	return arr
}