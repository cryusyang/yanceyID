import * as d3 from "d3";
import { ZKNode } from "../view/indexView";
import ZKNavigationPlugin from "../../main";
import { Menu, moment, Notice } from "obsidian";
import { TooltipManager } from "./tooltipManager";
import { YanceyID } from "./yanceyId";

const ZK_NAVIGATION = "zk-navigation";

interface TreeData extends ZKNode {
    children?: TreeData[];
    _children?: TreeData[]; // For folded state
}

export function convertZKNodesToTree(root: ZKNode, allNodes: ZKNode[]): TreeData {
    const treeRoot: TreeData = { ...root, children: [] };
    const nodeMap = new Map<string, TreeData>();
    nodeMap.set(treeRoot.IDStr, treeRoot);

    const descendants = allNodes
        .filter(n => n.IDStr.startsWith(root.IDStr) && n.IDStr !== root.IDStr)
        .sort((a, b) => a.IDArr.length - b.IDArr.length);

    for (const node of descendants) {
        const treeNode: TreeData = { ...node, children: [] };
        nodeMap.set(treeNode.IDStr, treeNode);

        let parentFound = false;
        
        if (node.IDArr.length > 1) {
             const parentIDStr = node.IDArr.slice(0, -1).toString();
             if (nodeMap.has(parentIDStr)) {
                 nodeMap.get(parentIDStr)?.children?.push(treeNode);
                 parentFound = true;
             }
        }

        if (!parentFound) {
             let bestParent: TreeData | null = null;
             let maxDepth = -1;
             
             for (const potentialParent of nodeMap.values()) {
                 if (potentialParent === treeNode) continue;
                 
                 if (potentialParent.IDArr.length < treeNode.IDArr.length) {
                     let isAncestor = true;
                     for(let i=0; i < potentialParent.IDArr.length; i++) {
                         if (potentialParent.IDArr[i] !== treeNode.IDArr[i]) {
                             isAncestor = false;
                             break;
                         }
                     }
                     
                     if (isAncestor) {
                         if (potentialParent.IDArr.length > maxDepth) {
                             maxDepth = potentialParent.IDArr.length;
                             bestParent = potentialParent;
                         }
                     }
                 }
             }
             
             if (bestParent) {
                 bestParent.children?.push(treeNode);
             }
        }
    }

    // Ensure strict sorting of children by IDStr (YanceyID order)
    // This prevents sibling reordering when nodes are folded/unfolded
    const sortChildren = (node: TreeData) => {
        if (node.children && node.children.length > 0) {
            node.children.sort((a, b) => a.IDStr.localeCompare(b.IDStr));
            node.children.forEach(sortChildren);
        }
    };
    sortChildren(treeRoot);

    return treeRoot;
}

export interface RenderOptions {
    width: number;
    height: number;
    nodeColor: string;
    direction: string;
    nodeRadius?: number;
    siblingSeparation?: number;
    levelSeparation?: number;
    highlightID?: string; // New field for highlighted node ID
}

// Global variable to persist zoom state across re-renders
let cachedZoomTransform: d3.ZoomTransform | null = null;

export function renderD3MindMap(
    container: HTMLElement, 
    rootNode: ZKNode, 
    allNodes: ZKNode[], 
    plugin: ZKNavigationPlugin,
    options: RenderOptions
) {
    container.innerHTML = "";

    // 参数
    let params = {
        nodeRadius: plugin.settings.d3NodeRadius || options.nodeRadius || 5,
        siblingSep: plugin.settings.d3SiblingSeparation || options.siblingSeparation || 30,
        levelSep: plugin.settings.d3LevelSeparation || options.levelSeparation || 150,
        fontSize: plugin.settings.d3FontSize || 12,
        textThreshold: 0.6 // Default text visibility threshold
    };

    // 滑块容器 - 使用简单的 div，放在最顶部
    const sliderContainer = container.createDiv({ cls: "zk-slider-container" });
    
    // 垂直间距滑块
    const verticalControl = sliderContainer.createDiv({ cls: "zk-slider-control" });
    verticalControl.createSpan({ text: "垂直间距: ", cls: "zk-slider-label" });
    const verticalValue = verticalControl.createSpan({ text: params.siblingSep.toString(), cls: "zk-slider-value" });
    const verticalSlider = verticalControl.createEl("input", { 
        type: "range",
        cls: "zk-slider"
    });
    verticalSlider.min = "10";
    verticalSlider.max = "100";
    verticalSlider.value = params.siblingSep.toString();
    verticalSlider.oninput = async (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        verticalValue.innerText = val.toString();
        params.siblingSep = val;
        plugin.settings.d3SiblingSeparation = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    };

    // 水平间距滑块
    const horizontalControl = sliderContainer.createDiv({ cls: "zk-slider-control" });
    horizontalControl.createSpan({ text: "水平间距: ", cls: "zk-slider-label" });
    const horizontalValue = horizontalControl.createSpan({ text: params.levelSep.toString(), cls: "zk-slider-value" });
    const horizontalSlider = horizontalControl.createEl("input", { 
        type: "range",
        cls: "zk-slider"
    });
    horizontalSlider.min = "50";
    horizontalSlider.max = "400";
    horizontalSlider.value = params.levelSep.toString();
    horizontalSlider.oninput = async (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        horizontalValue.innerText = val.toString();
        params.levelSep = val;
        plugin.settings.d3LevelSeparation = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    };

    // 节点大小滑块
    const nodeSizeControl = sliderContainer.createDiv({ cls: "zk-slider-control" });
    nodeSizeControl.createSpan({ text: "节点大小: ", cls: "zk-slider-label" });
    const nodeSizeValue = nodeSizeControl.createSpan({ text: params.nodeRadius.toString(), cls: "zk-slider-value" });
    const nodeSizeSlider = nodeSizeControl.createEl("input", { 
        type: "range",
        cls: "zk-slider"
    });
    nodeSizeSlider.min = "3";
    nodeSizeSlider.max = "15";
    nodeSizeSlider.value = params.nodeRadius.toString();
    nodeSizeSlider.oninput = async (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        nodeSizeValue.innerText = val.toString();
        params.nodeRadius = val;
        plugin.settings.d3NodeRadius = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    };

    // 文字大小滑块
    const fontSizeControl = sliderContainer.createDiv({ cls: "zk-slider-control" });
    fontSizeControl.createSpan({ text: "文字大小: ", cls: "zk-slider-label" });
    const fontSizeValue = fontSizeControl.createSpan({ text: params.fontSize.toString(), cls: "zk-slider-value" });
    const fontSizeSlider = fontSizeControl.createEl("input", { 
        type: "range",
        cls: "zk-slider"
    });
    fontSizeSlider.min = "8";
    fontSizeSlider.max = "20";
    fontSizeSlider.value = params.fontSize.toString();
    fontSizeSlider.oninput = async (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        fontSizeValue.innerText = val.toString();
        params.fontSize = val;
        plugin.settings.d3FontSize = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    };

    // 文字阈值滑块
    const thresholdControl = sliderContainer.createDiv({ cls: "zk-slider-control" });
    thresholdControl.createSpan({ text: "文字阈值: ", cls: "zk-slider-label" });
    const thresholdValue = thresholdControl.createSpan({ text: params.textThreshold.toString(), cls: "zk-slider-value" });
    const thresholdSlider = thresholdControl.createEl("input", { 
        type: "range",
        cls: "zk-slider"
    });
    thresholdSlider.min = "0.1";
    thresholdSlider.max = "2.0";
    thresholdSlider.step = "0.1";
    thresholdSlider.value = params.textThreshold.toString();

    // 图形容器
    const graphDiv = container.createDiv({ cls: "zk-d3-graph" });

    // Track TooltipManager to destroy it before re-rendering
    let tooltipManager: TooltipManager | null = null;

    // Helper to apply fold state
    const applyFoldState = (node: TreeData) => {
        const isFolded = plugin.settings.FoldNodeArr.some(f => 
            f.nodeIDstr === node.IDStr && f.graphID === container.id
        );

        if (isFolded && node.children && node.children.length > 0) {
            node._children = node.children;
            node.children = undefined;
        }

        // Continue traversal for children that are still visible (if any)
        if (node.children) {
            node.children.forEach(applyFoldState);
        }
    };

    updateGraph();

    function updateGraph() {
        // Cleanup previous TooltipManager
        if (tooltipManager) {
            tooltipManager.destroy();
            tooltipManager = null;
        }

        graphDiv.innerHTML = "";
        
        const data = convertZKNodesToTree(rootNode, allNodes);
        applyFoldState(data);

        const width = options.width || 800;
        const height = options.height || 600;
        const margin = { top: 20, right: 90, bottom: 30, left: 90 };

        const svg = d3.select(graphDiv).append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [-margin.left, -margin.top, width, height])
            .style("font", `${params.fontSize}px sans-serif`)
            .style("user-select", "none");

        const g = svg.append("g");

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 8])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
                cachedZoomTransform = event.transform;
            });

        svg.call(zoom);

        // Restore Zoom State or Initialize
        if (cachedZoomTransform) {
            // Restore previous state immediately (no animation)
            svg.call(zoom.transform, cachedZoomTransform);
        } else {
            // First render: center the view
            svg.call(zoom.transform, d3.zoomIdentity.translate(margin.left, height / 2).scale(1));
        }

        const root = d3.hierarchy<TreeData>(data);
        const tree = d3.tree<TreeData>()
            .nodeSize([params.siblingSep, params.levelSep]);

        tree(root);

        const link = g.selectAll(".link")
            .data(root.links())
            .enter().append("path")
            .attr("class", "link")
            .attr("d", d3.linkHorizontal<d3.HierarchyLink<TreeData>, d3.HierarchyPointNode<TreeData>>()
                .x(d => d.y)
                .y(d => d.x))
            .style("fill", "none")
            .style("stroke", "#ccc")
            .style("stroke-width", "1.5px")
            .style("transition", "stroke 0.2s, stroke-width 0.2s");

        const node = g.selectAll(".node")
            .data(root.descendants())
            .enter().append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.y},${d.x})`);

        node.append("circle")
            .attr("r", params.nodeRadius)
            .style("fill", d => {
                if (d.data._children) return "#7950F2"; // Folded color (Priority 1)
                if (options.highlightID && d.data.IDStr === options.highlightID) return "#fa5252"; // Highlight color (Priority 2)
                return d.data.IDStr.startsWith(rootNode.IDStr) ? "var(--interactive-accent)" : "var(--background-secondary)"; // Default color (Priority 3)
            })
            .style("stroke", d => d.data._children ? "#262626" : "var(--background-primary)")
            .style("stroke-width", d => d.data._children ? "3px" : "2px")
            .style("cursor", "pointer")
            .on("click", async (event: MouseEvent, d: d3.HierarchyPointNode<TreeData>) => {
                event.stopPropagation();
                // Toggle Fold/Unfold
                const foldIndex = plugin.settings.FoldNodeArr.findIndex(f => 
                    f.nodeIDstr === d.data.IDStr && f.graphID === container.id
                );

                if (foldIndex !== -1) {
                    // Unfold
                    plugin.settings.FoldNodeArr.splice(foldIndex, 1);
                } else {
                    // Fold
                    plugin.settings.FoldNodeArr.push({
                        graphID: container.id,
                        nodeIDstr: d.data.IDStr,
                        position: d.data.position
                    });
                }
                await plugin.saveData(plugin.settings);
                updateGraph();
            });

        node.append("text")
            .attr("dy", params.nodeRadius + 12)
            .attr("x", 0)
            .style("text-anchor", "middle")
            .text(d => d.data.displayText)
            .style("fill", "var(--text-normal)")
            .style("font-size", `${params.fontSize}px`)
            .style("font-family", "var(--font-interface)")
            .style("cursor", "pointer")
            .style("paint-order", "stroke")
            .style("stroke", "var(--background-primary)")
            .style("stroke-width", "3px")
            .style("stroke-linecap", "butt")
            .style("stroke-linejoin", "miter")
            .on("click", (event: MouseEvent, d: d3.HierarchyPointNode<TreeData>) => {
                event.stopPropagation();
                const zkNode = d.data;
                if (event.ctrlKey) {
                    plugin.app.workspace.openLinkText("", zkNode.file.path, 'tab');
                } else if (event.shiftKey) {
                     plugin.settings.lastRetrival = {
                        type: 'main',
                        ID: zkNode.ID,
                        displayText: zkNode.displayText,
                        filePath: zkNode.file.path,
                        openTime: moment().format("YYYY-MM-DD HH:mm:ss"),
                    }
                    plugin.clearShowingSettings().then(() => {
                        plugin.app.workspace.trigger("zk-navigation:refresh-index-graph");
                    });
                } else if (event.altKey) {
                     plugin.retrivalforLocaLgraph = {
                        type: '1',
                        ID: zkNode.ID,
                        filePath: zkNode.file.path,
                    };
                    plugin.openGraphView();
                } else {
                     plugin.app.workspace.openLinkText("", zkNode.file.path);
                }
            });

        const nodeG = g.selectAll(".node");

        tooltipManager = new TooltipManager(plugin.app);
        nodeG.each(function(d: d3.HierarchyPointNode<TreeData>) {
            tooltipManager?.attach(this as Element, d.data);
        });
        
        nodeG.on("contextmenu", (event: MouseEvent, d: d3.HierarchyPointNode<TreeData>) => {
             event.preventDefault();
             const zkNode = d.data;
             const menu = new Menu();

             // 辅助函数：安全地从 IDStr 获取最后一段 (Segment)
             const getSegment = (idStr: string): string => {
                 if (!idStr) return "";
                 const parts = idStr.split('/');
                 return parts[parts.length - 1] || "";
             };
            
             // 辅助函数：获取父路径 (不含最后一段)
             const getParentPath = (idStr: string): string => {
                 if (!idStr.includes('/')) return "";
                 return idStr.substring(0, idStr.lastIndexOf('/'));
             };
             
            // 1. Insert Before
            menu.addItem((item) => 
                item
                    .setTitle("➕ Insert Before")
                    .setIcon("arrow-up")
                    .onClick(async () => {
                        // Sanitize IDStr to ensure slashes
                        const currID = zkNode.IDStr.replace(/,/g, '/');
                        const parentPath = getParentPath(currID);
                        const currSeg = getSegment(currID);

                        let prevSeg: string | null = null;
                        if (d.parent && d.parent.children) {
                            const siblings = d.parent.children;
                            const index = siblings.indexOf(d);
                            if (index > 0) {
                                const prevID = siblings[index - 1].data.IDStr.replace(/,/g, '/');
                                prevSeg = getSegment(prevID);
                            }
                        }
                        
                        // 计算 (只传 5位数字片段)
                        const newSeg = YanceyID.generate(prevSeg, currSeg);
                        
                        // 显式拼接，杜绝逗号
                        const newID = parentPath ? `${parentPath}/${newSeg}` : newSeg;

                        await navigator.clipboard.writeText(newID);
                        new Notice(`📋 Insert Before: ${newID}`);
                    })
            );

            // 2. Insert After
            menu.addItem((item) => 
                item
                    .setTitle("➕ Insert After")
                    .setIcon("arrow-down")
                    .onClick(async () => {
                        // Sanitize IDStr
                        const currID = zkNode.IDStr.replace(/,/g, '/');
                        const parentPath = getParentPath(currID);
                        const currSeg = getSegment(currID);

                        let nextSeg: string | null = null;
                        if (d.parent && d.parent.children) {
                            const siblings = d.parent.children;
                            const index = siblings.indexOf(d);
                            // 检查是否有下一个兄弟节点
                            if (index !== -1 && index < siblings.length - 1) {
                                const nextID = siblings[index + 1].data.IDStr.replace(/,/g, '/');
                                nextSeg = getSegment(nextID);
                            }
                        }
                        
                        // 计算 (只传 5位数字片段)
                        const newSeg = YanceyID.generate(currSeg, nextSeg);
                        
                        // 显式拼接，杜绝逗号
                        const newID = parentPath ? `${parentPath}/${newSeg}` : newSeg;

                        await navigator.clipboard.writeText(newID);
                        new Notice(`📋 Insert After: ${newID}`);
                    })
            );

            menu.addItem((item) => 
                item
                    .setTitle("➕ Add Child")
                    .setIcon("plus-circle")
                    .onClick(async () => {
                        // 1. Construct Parent Path Safely
                        // Prefer IDArr joined by '/' to ensure correct separator
                        const parentPath = zkNode.IDArr ? zkNode.IDArr.join('/') : zkNode.IDStr.replace(/,/g, '/');
                        
                        let newSeg = "00100";
                        const children = zkNode.children; 
                        
                        // 2. Determine Strategy: First Born vs Tail Append
                        if (children && children.length > 0) {
                            // Tail Append Strategy
                            // Sort children by IDStr to find the true last child
                            const sortedChildren = [...children].sort((a, b) => a.IDStr.localeCompare(b.IDStr));
                            const lastChild = sortedChildren[sortedChildren.length - 1];
                            
                            // Extract last segment of the last child
                            const lastChildPath = lastChild.IDArr ? lastChild.IDArr.join('/') : lastChild.IDStr.replace(/,/g, '/');
                            const lastChildSeg = lastChildPath.split('/').pop();
                            
                            // Generate next segment (Tail Append: last + 100)
                            if (lastChildSeg) {
                                newSeg = YanceyID.generate(lastChildSeg, null);
                            }
                        } else {
                            // First Born Strategy
                            // YanceyID.generate(null, null) returns "00100"
                            newSeg = YanceyID.generate(null, null);
                        }
                        
                        // 3. Final Assembly
                        const newID = `${parentPath}/${newSeg}`;
                        
                        await navigator.clipboard.writeText(newID);
                        new Notice(`📋 Add Child: ${newID}`);
                    })
            );

            menu.addSeparator();
             
             for (let command of plugin.settings.NodeCommands) {
                 menu.addItem((item) =>
                     item
                         .setTitle(command.name)
                         .setIcon(command.icon)
                         .onClick(async () => {
                             let copyStr: string = '';
                             switch (command.copyType) {
                                 case 1:
                                     copyStr = zkNode.ID;
                                     break;
                                 case 2:
                                     copyStr = zkNode.file.path;
                                     break;
                                 case 3:
                                     copyStr = moment(zkNode.ctime).format(plugin.settings.datetimeFormat);
                                     break;
                                 default:
                                     break;
                             }
                             if (copyStr !== '') {
                                 await navigator.clipboard.writeText(copyStr);
                             }
                             plugin.app.commands.executeCommandById(command.id);
                         })
                 );
             }
             menu.showAtMouseEvent(event);
        });

        nodeG.on("mouseover", (event: MouseEvent, d: d3.HierarchyPointNode<TreeData>) => {
             // Highlight connections (Parent + Children)
             // Parent link: target is d
             // Child link: source is d
             link.filter(l => l.target === d || l.source === d)
                 .style("stroke", "var(--interactive-accent)")
                 .style("stroke-width", "3px");

             plugin.app.workspace.trigger('hover-link', {
                 event,
                 source: "zk-navigation",
                 hoverParent: container,
                 linktext: "",
                 targetEl: event.target,
                 sourcePath: d.data.file.path,
             });
        })
        .on("mouseout", (event: MouseEvent, d: d3.HierarchyPointNode<TreeData>) => {
             // Reset highlights
             link.style("stroke", "#ccc")
                 .style("stroke-width", "1.5px");
        });
    }
}
