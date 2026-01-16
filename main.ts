import { FileView, loadMermaid, moment, Notice, Plugin, TFile} from "obsidian";
import { t } from "src/lang/helper";
import { indexFuzzyModal, indexModal } from "src/modal/indexModal";
import { mainNoteFuzzyModal, mainNoteModal } from "src/modal/mainNoteModal";
import { ZKNavigationSettngTab } from "src/settings/settings";
import { mainNoteInit } from "src/utils/utils";
import { ZKGraphView, ZK_GRAPH_TYPE } from "src/view/graphView";
import { ZKIndexView, ZKNode, ZK_INDEX_TYPE, ZK_NAVIGATION } from "src/view/indexView";
import { ZK_OUTLINE_TYPE, ZKOutlineView } from "src/view/outlineView";
import { ZK_RECENT_TYPE, ZKRecentView } from "src/view/recentView";
import { ZK_TABLE_TYPE, ZKTableView } from "src/view/tableView";

export interface FoldNode{
    graphID: string;
    nodeIDstr: string;
    position: number;
}

interface Point {
    x: number;
    y: number;
}

export interface ZoomPanScale{
    graphID: string;
    zoomScale: number;
    pan:Point;
}

export interface Retrival {
    type: string;
    ID: string;
    displayText: string;
    filePath: string;
    openTime: string;
}

export interface LocalRetrival {
    type: string; //'1': click graph to refresh localgraph; '2': open file to refresh localgraph
    ID: string;
    filePath: string;
}

export interface NodeCommand {
    id: string;
    name: string;
    icon: string;
    copyType:number;
    active: boolean;
}

//settings fields
interface ZKNavigationSettings {
    FolderOfMainNotes: string;
    FolderList:string[];
    FolderOfIndexes: string;
    MainNoteExt: string; // "all" or ".md only"
    StartingPoint: string;
    DisplayLevel: string;
    NodeText: string;
    FamilyGraphToggle: boolean;
    InlinksGraphToggle: boolean;
    OutlinksGraphToggle: boolean;
    TagOfMainNotes: string; 
    IDField: string;    // specify a frontmatter field as note ID
    IndexButtonText: string;
    SuggestMode: string;
    FoldToggle: boolean;
    FoldNodeArr: FoldNode[];
    RedDashLine: boolean;
    zoomPanScaleArr:ZoomPanScale[];
    CustomCreatedTime: string;
    BranchTab: number;
    FileExtension:string; // "all" or ".md only"
    SectionTab:number;    
    DirectionOfBranchGraph: string;
    DirectionOfFamilyGraph: string;
    DirectionOfInlinksGraph: string;
    DirectionOfOutlinksGraph: string;
    BranchToolbra: boolean;
    RandomIndex: boolean;
    RandomMainNote: boolean;
    TableView: boolean;
    IndexButton: boolean;
    MainNoteButton: boolean;
    MainNoteButtonText: string;
    settingIcon:boolean;
    MainNoteSuggestMode: string;
    ListTree: boolean;
    HistoryList: Retrival[];
    HistoryToggle: boolean;
    HistoryMaxCount: number;
    exportCanvas: boolean;
    cardWidth: number;
    cardHeight: number;
    canvasFilePath: string;
    siblingsOrder: string;
    showAllToggle: boolean;
    showAll: boolean;
    outlineLayer: number;
    maxLenMainModel: number;
    maxLenIndexModel: number;
    multiIDToggle: boolean;
    multiIDField: string;
    lastRetrival: Retrival;
    NodeCommands: NodeCommand[];
    siblingLenToggle: boolean;
    displayTimeToggle: boolean;
    playControllerToggle: boolean;
    nodeColor: string;
    datetimeFormat: string;
    graphType: string;
    nodeClose: boolean;
    gitUncrossing: boolean;
    canvasSubpath: string;
    canvasCardColor: string;
    canvasArrowColor: string;
    headingMatchMode: string; // "string" or "regex"
    NodeSpacingToggle: boolean;
    d3NodeRadius: number;
    d3SiblingSeparation: number;
    d3LevelSeparation: number;
    d3FontSize: number;
    d3NodeColor: string;
    d3FoldingNodeColor: string;
    d3HighlightNodeColor: string;
    d3LineWidth: number;
    d3HighlightLineColor: string;
    d3TextThreshold: number;
    d3ZoomSensitivity: number;
    d3ZoomSmoothness: number;
    d3PanResponsiveness: number;
    d3PanInertia: number;
    d3LastTransform: { x: number; y: number; k: number } | null;
}

//Default value for setting field
const DEFAULT_SETTINGS: ZKNavigationSettings = {
    FolderOfMainNotes: '',
    FolderList: [],
    FolderOfIndexes: '',
    MainNoteExt:"md",
    StartingPoint: 'parent',
    DisplayLevel: 'end',
    NodeText: "both",
    FamilyGraphToggle: true,
    InlinksGraphToggle: true,
    OutlinksGraphToggle: true,
    TagOfMainNotes: '',
    IDField: '',
    IndexButtonText: t('📖index'),
    SuggestMode: 'fuzzySuggest',
    FoldToggle: false,
    FoldNodeArr: [],
    RedDashLine:false,
    zoomPanScaleArr:[],
    CustomCreatedTime: '',
    BranchTab: 0,
    FileExtension: "md",
    SectionTab: 0,
    DirectionOfBranchGraph: "LR",
    DirectionOfFamilyGraph: "LR",
    DirectionOfInlinksGraph: "TB",
    DirectionOfOutlinksGraph: "TB",
    BranchToolbra: true,
    RandomIndex: true,
    RandomMainNote: true,
    TableView: true,
    IndexButton: false,
    MainNoteButton: true,
    MainNoteButtonText: t("Main notes"),
    settingIcon: true,
    MainNoteSuggestMode: 'fuzzySuggest',
    ListTree: true,
    HistoryList: [],
    HistoryToggle: true,
    HistoryMaxCount: 20,
    exportCanvas: true,
    cardWidth: 400,
    cardHeight: 240,
    canvasFilePath: "",
    siblingsOrder: "number", 
    showAll: false,
    showAllToggle: true,
    outlineLayer: 2,
    maxLenMainModel: 100,
    maxLenIndexModel: 100,
    multiIDToggle: false,
    multiIDField: '',
    lastRetrival: {type:'', ID:'',displayText:'', filePath:'', openTime:''},
    NodeCommands: [],
    siblingLenToggle: false,
    displayTimeToggle: false,
    playControllerToggle: true,
    nodeColor: "#FFFFAA",
    datetimeFormat: "yyyy-MM-DD HH:mm",
    graphType: "structure",
    nodeClose: false,
    gitUncrossing: false,
    canvasSubpath: "",
    canvasCardColor: "#C0C0C0",
    canvasArrowColor: "#C0C0C0",
    headingMatchMode: "string",
    NodeSpacingToggle: true,
    d3NodeRadius: 5,
    d3SiblingSeparation: 30,
    d3LevelSeparation: 150,
    d3FontSize: 12,
    d3NodeColor: "#268bd2",
    d3FoldingNodeColor: "#7950F2",
    d3HighlightNodeColor: "#fa5252",
    d3LineWidth: 1.5,
    d3HighlightLineColor: "var(--interactive-accent)",
    d3TextThreshold: 0.6,
    d3ZoomSensitivity: 0.5,
    d3ZoomSmoothness: 0.1,
    d3PanResponsiveness: 0.2,
    d3PanInertia: 0.95,
    d3LastTransform: null
};

export default class ZKNavigationPlugin extends Plugin {

    settings: ZKNavigationSettings;
    MainNotes: ZKNode[] = [];
    tableArr: ZKNode[] = [];
    retrivalforLocaLgraph: LocalRetrival = {
        type: '2',
        ID: '',
        filePath: '',
    };
    indexViewOffsetWidth: number = 0;
    indexViewOffsetHeight: number = 0;
    RefreshIndexViewFlag: boolean = false;
    mainNoteModal: boolean = false;
    indexModal: boolean = false;

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        )        
    }

    async onload() {

        await this.loadSettings();
        
        this.registerObsidianProtocolHandler("zk-navigation",async (para)=>{

            if(para.file){             
                
                let file = this.app.vault.getFileByPath(para.file);

                if(!file){
                    new Notice(`zk-navigation: file "${para.file}" can't be found!`);
                    return;

                } 
                
                if(para.from && ["root","parent","index"].includes(para.from)){
                    this.settings.StartingPoint = para.from;
                    
                }
                if(para.to && ["next","end"].includes(para.to)){
                    this.settings.DisplayLevel = para.to;
                }
                if(para.text && ["id","title","both"].includes(para.text)){
                    this.settings.NodeText = para.text;
                }
                if(para.type && ["structure","roadmap"].includes(para.type)){
                    this.settings.graphType = para.type;
                }

                let indexFlag:boolean = false;
                
                if(this.settings.FolderOfIndexes !== ""){
                    if(para.file.startsWith(this.settings.FolderOfIndexes)){
                        indexFlag = true;
                        
                        this.settings.lastRetrival = {
                            type: 'index',
                            ID: '',
                            displayText: '',
                            filePath: file.path,
                            openTime: '',  
                        };
                        this.settings.zoomPanScaleArr = [];
                        this.settings.BranchTab = 0;
                        this.settings.FoldNodeArr = [];  
                        this.RefreshIndexViewFlag = true;
                        await this.openIndexView();
                    }
                }

                if(!indexFlag){
                    
                    this.settings.lastRetrival = {
                        type: 'main',
                        ID: '',
                        displayText: '',
                        filePath: file.path,
                        openTime: '',  
                    };
                    this.settings.zoomPanScaleArr = [];
                    this.settings.BranchTab = 0;
                    this.settings.FoldNodeArr = [];  
                    this.RefreshIndexViewFlag = true;
                    await this.openIndexView();
                }

            } else {
                new Notice(`zk-navigation: invalid uri`);
            }
        })

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file, source) => {
                
                if (
                    !(
                        source === "more-options" ||
                        source === "tab-header" ||
                        source == "file-explorer-context-menu"
                    )
                ) {
                    return;
                }

                if (!(file instanceof TFile)) {
                    return;
                }

                menu.addItem((item) => {
                    item.setTitle(t("Copy zk-navigation URI"))
                        .setIcon("copy")
                        .setSection("info")
                        .onClick(() =>
                            
                            navigator.clipboard.writeText(`obsidian://zk-navigation?file=${encodeURI(file.path)}`)
                        );
                });
            })
        );

        this.addSettingTab(new ZKNavigationSettngTab(this.app, this));

        this.registerView(ZK_INDEX_TYPE, (leaf) => new ZKIndexView(leaf, this));

        this.registerView(ZK_GRAPH_TYPE, (leaf) => new ZKGraphView(leaf, this));

        this.registerView(ZK_OUTLINE_TYPE, (leaf) => new ZKOutlineView(leaf, this));

        this.registerView(ZK_RECENT_TYPE, (leaf) => new ZKRecentView(leaf, this));

        this.registerView(ZK_TABLE_TYPE, (leaf) => new ZKTableView(leaf, this, this.tableArr));
              
        this.addRibbonIcon("ghost", t("open_main_view"), async () => {
            
            this.openIndexView();
            
        })

        this.addRibbonIcon("network", t("open_index_view"), async () => {
            
            this.openGraphView();
        });

        this.addCommand({
            id: "zk-index-graph",
            name: t("open_main_view"),
            callback: async () => {
                this.openIndexView();
            }
        });

        this.addCommand({
            id: "zk-local-graph",
            name: t("open_index_view"),
            callback: async () => {
                this.openGraphView();
            }
        });

        this.addCommand({
            id: "zk-index-graph-by-file",
            name: t("reveal_file_in_main_view"),
            callback: async () => {
                await this.revealFileInIndexView();
            }
        });


        this.addCommand({
            id: "zk-mainnote-modal",
            name: t("select a main note"),
            callback: async ()=>{
                this.mainNoteModal = true;
                await this.openIndexView();
            }
        })


        this.addCommand({
            id: "zk-index-modal",
            name: t("select an index"),
            callback: async ()=>{
                this.indexModal = true;
                await this.openIndexView();
            }
        })


        this.registerHoverLinkSource(
        ZK_NAVIGATION,
        {
            defaultMod:true,
            display:ZK_NAVIGATION,
        });     

    }

    async openIndexView() {

        if(this.app.workspace.getLeavesOfType(ZK_INDEX_TYPE).length === 0){
         await this.app.workspace.getLeaf('tab')?.setViewState({
             type:ZK_INDEX_TYPE,
             active:true,
         });
        }
        
        this.app.workspace.revealLeaf(
         this.app.workspace.getLeavesOfType(ZK_INDEX_TYPE)[0]
         
        );

        if(this.RefreshIndexViewFlag === true){
            this.app.workspace.trigger("zk-navigation:refresh-index-graph");
        }

        if(this.mainNoteModal === true){

            if (this.settings.MainNoteSuggestMode === "IDOrder") {
                new mainNoteModal(this.app, this, this.MainNotes, (selectZKNode) =>{
                    this.settings.lastRetrival = {
                        type: 'main',
                        ID: selectZKNode.ID,
                        displayText: selectZKNode.displayText,
                        filePath: selectZKNode.file.path,
                        openTime: moment().format("YYYY-MM-DD HH:mm:ss"),
                    
                    }
                    this.clearShowingSettings();
                    this.app.workspace.trigger("zk-navigation:refresh-index-graph");
                }).open();
            }else {
                new mainNoteFuzzyModal(this.app, this, this.MainNotes, (selectZKNode) =>{
                    this.settings.lastRetrival = {
                        type: 'main',
                        ID: selectZKNode.ID,
                        displayText: selectZKNode.displayText,
                        filePath: selectZKNode.file.path,
                        openTime: moment().format("YYYY-MM-DD HH:mm:ss"),
                    
                    }
                    this.clearShowingSettings();
                    this.app.workspace.trigger("zk-navigation:refresh-index-graph");
                }).open()
            }

            this.mainNoteModal = false;
        }

        if(this.indexModal === true){

            if (this.settings.SuggestMode === "keywordOrder") {
                new indexModal(this.app, this, this.MainNotes, (index) => {
                    this.settings.lastRetrival = {
                        type: 'index',
                        ID: '',
                        displayText: index.keyword,
                        filePath: index.path,
                        openTime: moment().format("YYYY-MM-DD HH:mm:ss"),
                    
                    }
                    this.clearShowingSettings();
                    this.app.workspace.trigger("zk-navigation:refresh-index-graph");
                }).open();
            } else {
                new indexFuzzyModal(this.app, this, this.MainNotes, (index) => {
                    this.settings.lastRetrival = {
                        type: 'index',
                        ID: '',
                        displayText: index.keyword,
                        filePath: index.path,
                        openTime: moment().format("YYYY-MM-DD HH:mm:ss"),
                    
                    }
                    this.clearShowingSettings();
                    this.app.workspace.trigger("zk-navigation:refresh-index-graph");
                }).open();
            }

            this.indexModal = false;
        }

    }

    async openGraphView() {

       if(this.app.workspace.getLeavesOfType(ZK_GRAPH_TYPE).length === 0){
        await this.app.workspace.getRightLeaf(false)?.setViewState({
            type:ZK_GRAPH_TYPE,
            active:true,
        });
        
       }
       this.app.workspace.revealLeaf(
        this.app.workspace.getLeavesOfType(ZK_GRAPH_TYPE)[0]
       );
       this.app.workspace.trigger("zk-navigation:refresh-local-graph");
    }

    async openTableView() {

        if(this.app.workspace.getLeavesOfType(ZK_TABLE_TYPE).length === 0){
            await this.app.workspace.getLeaf('split','horizontal')?.setViewState({
                type:ZK_TABLE_TYPE,
                active: true,
            })
        }
        this.app.workspace.revealLeaf(
            this.app.workspace.getLeavesOfType(ZK_TABLE_TYPE)[0]
        );
        this.app.workspace.trigger("zk-navigation:refresh-table-view");

    }

    async openOutlineView() {
        if(this.app.workspace.getLeavesOfType(ZK_OUTLINE_TYPE).length === 0){
         await this.app.workspace.getRightLeaf(false)?.setViewState({
             type:ZK_OUTLINE_TYPE,
             active:true,
         });
        }
        this.app.workspace.revealLeaf(
         this.app.workspace.getLeavesOfType(ZK_OUTLINE_TYPE)[0]
        );
        await this.app.workspace.trigger("zk-navigation:refresh-outline-view");
    
    }

    async openRecentView() {
        if(this.app.workspace.getLeavesOfType(ZK_RECENT_TYPE).length === 0){
         await this.app.workspace.getRightLeaf(false)?.setViewState({
             type:ZK_RECENT_TYPE,
             active:true,
         });
        }
        this.app.workspace.revealLeaf(
         this.app.workspace.getLeavesOfType(ZK_RECENT_TYPE)[0]
        );
        this.app.workspace.trigger("zk-navigation:refresh-recent-view");
    
    }

    async clearShowingSettings(BranchTab:number=0){
        this.settings.zoomPanScaleArr = [];
        this.settings.BranchTab = BranchTab;
        this.settings.FoldNodeArr = [];   
    }

    async revealFileInIndexView(){
        
        let filePath = this.app.workspace.getActiveViewOfType(FileView)?.file?.path

        if(filePath){

            let indexFlag:boolean = false;

            if(this.settings.FolderOfIndexes !== "" && filePath.endsWith(".md")){
                if(filePath.startsWith(this.settings.FolderOfIndexes)){
                    indexFlag = true;
                    
                    this.settings.lastRetrival = {
                        type: 'index',
                        ID: '',
                        displayText: '',
                        filePath: filePath,
                        openTime: '',  
                    };
                    this.clearShowingSettings();
                    this.RefreshIndexViewFlag = true;
                    await this.openIndexView();
                    
                }
            }

            if(!indexFlag){

                await mainNoteInit(this);
                
                this.settings.lastRetrival = {
                    type: 'main',
                    ID: '',
                    displayText: '',
                    filePath: filePath,
                    openTime: '',  
                };
                this.clearShowingSettings();
                this.RefreshIndexViewFlag = true;
                await this.openIndexView();
            }
            return;            
        }
    }

    onunload() {
        this.saveData(this.settings);
    }
}