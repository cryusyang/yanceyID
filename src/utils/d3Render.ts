import * as d3 from "d3";
import { ZKNode } from "../view/indexView";
import ZKNavigationPlugin from "../../main";
import { Menu, moment, Notice, setIcon, debounce } from "obsidian";
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
        nodeColor: plugin.settings.d3NodeColor || options.nodeColor || "#268bd2",
        foldingNodeColor: plugin.settings.d3FoldingNodeColor || "#7950F2",
        highlightNodeColor: plugin.settings.d3HighlightNodeColor || "#fa5252",
        lineWidth: plugin.settings.d3LineWidth || 1.5,
        highlightLineColor: plugin.settings.d3HighlightLineColor || "var(--interactive-accent)",
        textThreshold: plugin.settings.d3TextThreshold || 0.6,
        zoomSensitivity: plugin.settings.d3ZoomSensitivity || 0.5,
        zoomSmoothness: plugin.settings.d3ZoomSmoothness || 0.1,
        panResponsiveness: plugin.settings.d3PanResponsiveness || 0.2,
        panInertia: plugin.settings.d3PanInertia || 0.95
    };

    // Settings Trigger Button (Top Right)
    const settingsTrigger = container.createDiv({ cls: "zk-settings-trigger" });
    setIcon(settingsTrigger, "sliders-horizontal");
    settingsTrigger.onclick = () => {
        sliderContainer.style.display = "block";
        settingsTrigger.style.display = "none";
    };

    // --- Settings Panel ---
    const sliderContainer = container.createDiv({ cls: "zk-slider-container" });
    sliderContainer.style.display = "none";

    // Header Bar (Fixed at top of panel)
    const panelHeader = sliderContainer.createDiv({ cls: "zk-panel-header" });
    
    // Header Left: Title
    panelHeader.createSpan({ text: "Main View Settings", cls: "zk-panel-title" });

    // Header Right: Close Button
    const closeBtn = panelHeader.createDiv({ cls: "zk-settings-close" });
    setIcon(closeBtn, "x");
    closeBtn.onclick = (e) => {
        e.stopPropagation(); 
        sliderContainer.style.display = "none";
        settingsTrigger.style.display = "flex";
    };

    // --- Collapsible Group: Display ---
    const groupDisplay = sliderContainer.createDiv({ cls: "zk-settings-group" });
    const groupHeader = groupDisplay.createDiv({ cls: "zk-group-header" });
    
    // Group Arrow
    const arrowIcon = groupHeader.createDiv({ cls: "zk-group-arrow" });
    setIcon(arrowIcon, "chevron-right"); // Default closed
    
    // Group Title
    groupHeader.createSpan({ text: "Basic Display Items", cls: "zk-group-title" });

    // Content Area
    const settingsContent = groupDisplay.createDiv({ cls: "zk-group-content" });
    settingsContent.style.display = "none"; // Default hidden

    // Toggle Logic
    let isOpen = false; 
    groupHeader.onclick = () => {
        isOpen = !isOpen;
        if (isOpen) {
            settingsContent.style.display = "block";
            setIcon(arrowIcon, "chevron-down");
        } else {
            settingsContent.style.display = "none";
            setIcon(arrowIcon, "chevron-right");
        }
    };

    // --- Slider Helper (No Numbers) ---
    function createSlider(
        container: HTMLElement,
        labelText: string,
        min: number,
        max: number,
        step: number,
        initialValue: number,
        onChange: (val: number) => void
    ) {
        const wrapper = container.createDiv({ cls: "zk-slider-control" });
        
        // Label only
        wrapper.createDiv({ text: labelText, cls: "zk-slider-label" });
        
        const slider = wrapper.createEl("input", {
            type: "range",
            cls: "zk-slider"
        });
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(initialValue);
        slider.oninput = (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            onChange(val);
        };
    }

    // 1. Vertical Spacing
    createSlider(settingsContent, "Vertical Spacing", 10, 100, 1, params.siblingSep, async (val) => {
        params.siblingSep = val;
        plugin.settings.d3SiblingSeparation = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    });

    // 2. Horizontal Spacing
    createSlider(settingsContent, "Horizontal Spacing", 50, 400, 10, params.levelSep, async (val) => {
        params.levelSep = val;
        plugin.settings.d3LevelSeparation = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    });

    // 3. Node Size
    createSlider(settingsContent, "Node Size", 3, 15, 1, params.nodeRadius, async (val) => {
        params.nodeRadius = val;
        plugin.settings.d3NodeRadius = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    });

    // 4. Font Size
    createSlider(settingsContent, "Font Size", 8, 20, 1, params.fontSize, async (val) => {
        params.fontSize = val;
        plugin.settings.d3FontSize = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    });

    // 5. Text Threshold
    createSlider(settingsContent, "Text Threshold", 0.1, 2.0, 0.1, params.textThreshold, async (val) => {
        params.textThreshold = val;
        plugin.settings.d3TextThreshold = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    });

    // --- Collapsible Group: Node Color Display ---
    const groupNodeColor = sliderContainer.createDiv({ cls: "zk-settings-group" });
    const groupHeaderNodeColor = groupNodeColor.createDiv({ cls: "zk-group-header" });
    
    // Group Arrow
    const arrowIconNodeColor = groupHeaderNodeColor.createDiv({ cls: "zk-group-arrow" });
    setIcon(arrowIconNodeColor, "chevron-right"); // Default closed
    
    // Group Title
    groupHeaderNodeColor.createSpan({ text: "Node Color Display", cls: "zk-group-title" });

    // Content Area
    const settingsContentNodeColor = groupNodeColor.createDiv({ cls: "zk-group-content" });
    settingsContentNodeColor.style.display = "none"; // Default hidden

    // Toggle Logic
    let isOpenNodeColor = false; 
    groupHeaderNodeColor.onclick = () => {
        isOpenNodeColor = !isOpenNodeColor;
        if (isOpenNodeColor) {
            settingsContentNodeColor.style.display = "block";
            setIcon(arrowIconNodeColor, "chevron-down");
        } else {
            settingsContentNodeColor.style.display = "none";
            setIcon(arrowIconNodeColor, "chevron-right");
        }
    };

    // Normal Node Color
    const colorRow = settingsContentNodeColor.createDiv({ cls: "zk-color-row" });
    colorRow.createDiv({ text: "Normal Node Color", cls: "zk-color-label" });
    
    const colorInput = colorRow.createEl("input", { 
        type: "color", 
        cls: "zk-color-input" 
    });
    colorInput.value = plugin.settings.d3NodeColor;
    
    colorInput.oninput = async (e) => {
        const val = (e.target as HTMLInputElement).value;
        params.nodeColor = val;
        plugin.settings.d3NodeColor = val;
        await plugin.saveData(plugin.settings);
        // Update color directly for better performance, or full re-render
        // For simplicity and consistency (folded state etc), we call updateGraph
        updateGraph();
    };

    // Folding Node Color
    const colorRowFolding = settingsContentNodeColor.createDiv({ cls: "zk-color-row" });
    colorRowFolding.createDiv({ text: "Folding Node Color", cls: "zk-color-label" });
    
    const colorInputFolding = colorRowFolding.createEl("input", { 
        type: "color", 
        cls: "zk-color-input" 
    });
    colorInputFolding.value = plugin.settings.d3FoldingNodeColor;
    
    colorInputFolding.oninput = async (e) => {
        const val = (e.target as HTMLInputElement).value;
        params.foldingNodeColor = val;
        plugin.settings.d3FoldingNodeColor = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    };

    // Highlight Node Color
    const colorRowHighlight = settingsContentNodeColor.createDiv({ cls: "zk-color-row" });
    colorRowHighlight.createDiv({ text: "Highlight Node Color", cls: "zk-color-label" });
    
    const colorInputHighlight = colorRowHighlight.createEl("input", { 
        type: "color", 
        cls: "zk-color-input" 
    });
    colorInputHighlight.value = plugin.settings.d3HighlightNodeColor;
    
    colorInputHighlight.oninput = async (e) => {
        const val = (e.target as HTMLInputElement).value;
        params.highlightNodeColor = val;
        plugin.settings.d3HighlightNodeColor = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    };

    // --- Collapsible Group: Line Display Items ---
    const groupLineDisplay = sliderContainer.createDiv({ cls: "zk-settings-group" });
    const groupHeaderLineDisplay = groupLineDisplay.createDiv({ cls: "zk-group-header" });
    
    // Group Arrow
    const arrowIconLineDisplay = groupHeaderLineDisplay.createDiv({ cls: "zk-group-arrow" });
    setIcon(arrowIconLineDisplay, "chevron-right"); // Default closed
    
    // Group Title
    groupHeaderLineDisplay.createSpan({ text: "Line Display Items", cls: "zk-group-title" });

    // Content Area
    const settingsContentLineDisplay = groupLineDisplay.createDiv({ cls: "zk-group-content" });
    settingsContentLineDisplay.style.display = "none"; // Default hidden

    // Toggle Logic
    let isOpenLineDisplay = false; 
    groupHeaderLineDisplay.onclick = () => {
        isOpenLineDisplay = !isOpenLineDisplay;
        if (isOpenLineDisplay) {
            settingsContentLineDisplay.style.display = "block";
            setIcon(arrowIconLineDisplay, "chevron-down");
        } else {
            settingsContentLineDisplay.style.display = "none";
            setIcon(arrowIconLineDisplay, "chevron-right");
        }
    };

    // Line Thickness Sub-option
    createSlider(settingsContentLineDisplay, "Line Thickness", 0.5, 10, 0.5, params.lineWidth, async (val) => {
        params.lineWidth = val;
        plugin.settings.d3LineWidth = val;
        await plugin.saveData(plugin.settings);
        updateGraph();
    });

    // Activated Line Color Sub-option
    const activatedLineColorRow = settingsContentLineDisplay.createDiv({ cls: "zk-color-row" });
    activatedLineColorRow.createDiv({ text: "Activated Line Color", cls: "zk-color-label" });

    const activatedLineColorInput = activatedLineColorRow.createEl("input", {
        type: "color",
        cls: "zk-color-input"
    });
    // Handle CSS variable default
    const currentColor = plugin.settings.d3HighlightLineColor.startsWith("var") 
        ? "#7950F2" // Default fallback if var() is used (browser color picker doesn't support var())
        : plugin.settings.d3HighlightLineColor;
    activatedLineColorInput.value = currentColor;

    activatedLineColorInput.oninput = async (e) => {
        const val = (e.target as HTMLInputElement).value;
        params.highlightLineColor = val;
        plugin.settings.d3HighlightLineColor = val;
        await plugin.saveData(plugin.settings);
        // No need to updateGraph immediately as this affects hover state only, 
        // but updating ensures params are fresh if we re-render elsewhere.
        // updateGraph(); 
    };

    // --- Collapsible Group: Dynamics Settings ---
    const groupDynamics = sliderContainer.createDiv({ cls: "zk-settings-group" });
    const groupHeaderDynamics = groupDynamics.createDiv({ cls: "zk-group-header" });
    
    // Group Arrow
    const arrowIconDynamics = groupHeaderDynamics.createDiv({ cls: "zk-group-arrow" });
    setIcon(arrowIconDynamics, "chevron-right"); // Default closed
    
    // Group Title
    groupHeaderDynamics.createSpan({ text: "Dynamics Settings", cls: "zk-group-title" });

    // Content Area
    const settingsContentDynamics = groupDynamics.createDiv({ cls: "zk-group-content" });
    settingsContentDynamics.style.display = "none"; // Default hidden

    // Toggle Logic
    let isOpenDynamics = false; 
    groupHeaderDynamics.onclick = () => {
        isOpenDynamics = !isOpenDynamics;
        if (isOpenDynamics) {
            settingsContentDynamics.style.display = "block";
            setIcon(arrowIconDynamics, "chevron-down");
        } else {
            settingsContentDynamics.style.display = "none";
            setIcon(arrowIconDynamics, "chevron-right");
        }
    };

    // Zoom Sensitivity Sub-option
    createSlider(settingsContentDynamics, "Zoom Sensitivity", 0.1, 3.0, 0.1, params.zoomSensitivity, async (val) => {
        params.zoomSensitivity = val;
        plugin.settings.d3ZoomSensitivity = val;
        await plugin.saveData(plugin.settings);
        // affects interaction immediately via params reference
    });

    // Zoom Smoothness Sub-option
    createSlider(settingsContentDynamics, "Zoom Smoothness", 0.01, 0.5, 0.01, params.zoomSmoothness, async (val) => {
        params.zoomSmoothness = val;
        plugin.settings.d3ZoomSmoothness = val;
        await plugin.saveData(plugin.settings);
        // affects interaction immediately via params reference
    });

    // Pan Responsiveness Sub-option
    createSlider(settingsContentDynamics, "Pan Responsiveness", 0.05, 1.0, 0.05, params.panResponsiveness, async (val) => {
        params.panResponsiveness = val;
        plugin.settings.d3PanResponsiveness = val;
        await plugin.saveData(plugin.settings);
        // affects interaction immediately via params reference
    });

    // Pan Inertia Sub-option
    createSlider(settingsContentDynamics, "Pan Inertia", 0.80, 0.99, 0.01, params.panInertia, async (val) => {
        params.panInertia = val;
        plugin.settings.d3PanInertia = val;
        await plugin.saveData(plugin.settings);
        // affects interaction immediately via params reference
    });

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
            .style("user-select", "none")
            .style("cursor", "move"); // Improve cursor feedback

        const g = svg.append("g");

        // --- Physics-based Zoom Implementation ---
        
        // State variables for physics loop
        let currentTransform = d3.zoomIdentity;
        if (cachedZoomTransform) {
            currentTransform = cachedZoomTransform;
        } else if (plugin.settings.d3LastTransform) {
            const t = plugin.settings.d3LastTransform;
            currentTransform = d3.zoomIdentity.translate(t.x, t.y).scale(t.k);
        } else {
            // Initial center
            currentTransform = d3.zoomIdentity.translate(margin.left, height / 2).scale(1);
        }
        
        // Target transform starts equal to current
        let targetTransform = currentTransform;

        // Physics State
        let isDragging = false;
        let velocity = { x: 0, y: 0 };
        let lastTargetTransform = currentTransform;

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 8])
            .filter((event) => {
                // Disable default wheel handling to implement custom physics
                return !event.type.includes("wheel");
            })
            .on("start", (event) => {
                // Check if this is a user-initiated drag (mouse/touch)
                if (event.sourceEvent && (event.sourceEvent.type === "mousedown" || event.sourceEvent.type === "touchstart")) {
                    isDragging = true;
                    velocity = { x: 0, y: 0 };
                    // Reset tracking
                    lastTargetTransform = event.transform; 
                    
                    // Sync target immediately to prevent jumps
                    targetTransform = event.transform;
                    
                    // Start loop if needed
                    if (!isAnimating) {
                        isAnimating = true;
                        requestAnimationFrame(tick);
                    }
                }
            })
            .on("zoom", (event) => {
                const transform = event.transform;

                // Handle updates from D3
                // If the event is user-initiated dragging (mousemove/touch), we treat it as input for target
                if (event.sourceEvent && (event.sourceEvent.type === "mousemove" || event.sourceEvent.type === "touchmove")) {
                    // Calculate instantaneous velocity (delta per event)
                    // We will use this on release
                    velocity = {
                        x: transform.x - lastTargetTransform.x,
                        y: transform.y - lastTargetTransform.y
                    };
                    
                    lastTargetTransform = transform;
                    targetTransform = transform;
                    
                    // During drag, we DO NOT snap currentTransform to target.
                    // We let the Lerp loop in tick() handle the "smooth follow".
                } 
                else if (!event.sourceEvent) {
                     // Programmatic zoom (e.g. wheel physics or inertia sync)
                     // We ignore this here because we drive the rendering in tick()
                }

                // Note: We deliberately do NOT update DOM here. 
                // The tick() loop handles all rendering.
            })
            .on("end", (event) => {
                if (isDragging) {
                    isDragging = false;
                    // On release, we enter inertia phase with the last calculated velocity
                }
            });

        svg.call(zoom).on("dblclick.zoom", null);
        
        // Initialize D3 state to match our starting state
        // We do this silently
        zoom.transform(svg, currentTransform);
        g.attr("transform", currentTransform.toString());
        
        // Check initial text visibility
        if (currentTransform.k < params.textThreshold) {
            graphDiv.classList.add("zk-text-hidden");
        }

        // Custom Wheel Listener for Momentum Zoom
        svg.on("wheel", (event) => {
            event.preventDefault();

            // Calculate wheel delta with normalization
            // Similar to D3's internal normalization but simplified
            const wheelDelta = -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
            
            // Limit max speed per event to avoid uncontrollable jumps
            const limitedDelta = Math.max(-1, Math.min(1, wheelDelta));
            
            // Scale factor: 2^delta. 
            // We multiply delta to make it faster/slower. 
            // For momentum, we want to accumulate target.
            const k = Math.pow(2, limitedDelta * params.zoomSensitivity);
            
            // Calculate new target scale
            // Respect scaleExtent
            const extent = zoom.scaleExtent();
            let newK = targetTransform.k * k;
            
            // Clamp k
            if (newK < extent[0]) newK = extent[0];
            if (newK > extent[1]) newK = extent[1];
            
            // Calculate new target translate to keep mouse point fixed
            // Mouse position relative to SVG
            const [mx, my] = d3.pointer(event, svg.node());
            
            // World position (relative to g) before zoom
            // world = (mouse - translate) / scale
            const wx = (mx - targetTransform.x) / targetTransform.k;
            const wy = (my - targetTransform.y) / targetTransform.k;
            
            // New translate: mouse - world * newScale
            const newX = mx - wx * newK;
            const newY = my - wy * newK;
            
            // Update target
            targetTransform = d3.zoomIdentity.translate(newX, newY).scale(newK);
            
            // Start animation loop if not running
            if (!isAnimating) {
                isAnimating = true;
                requestAnimationFrame(tick);
            }
        });

        let isAnimating = false;

        const saveTransform = debounce(async (t: d3.ZoomTransform) => {
            plugin.settings.d3LastTransform = { x: t.x, y: t.y, k: t.k };
            await plugin.saveData(plugin.settings);
        }, 1000);
        
        function tick() {
            // Physics Constants
            // If scale is changing (zooming), we use zoomSmoothness for EVERYTHING to ensure K and XY stay synced (prevent drift).
            // If scale is static (panning/dragging/inertia), we use panResponsiveness for XY.
            
            const kDist = targetTransform.k - currentTransform.k;
            const isZooming = Math.abs(kDist) > 0.001;

            const dampingK = params.zoomSmoothness; 
            const dampingXY = isZooming ? params.zoomSmoothness : params.panResponsiveness;

            const friction = params.panInertia; // For Inertia (Fling)
            const velocityThreshold = 0.1;
            const epsilon = 0.001;

            // 1. Handle Inertia (When not dragging)
            if (!isDragging) {
                if (Math.abs(velocity.x) > velocityThreshold || Math.abs(velocity.y) > velocityThreshold) {
                    // Apply velocity to target
                    // Note: velocity is in "screen pixels" since it came from d3 transform delta
                    // We just add it to target's x/y
                    const nextX = targetTransform.x + velocity.x;
                    const nextY = targetTransform.y + velocity.y;
                    
                    targetTransform = d3.zoomIdentity.translate(nextX, nextY).scale(targetTransform.k);
                    
                    // Apply Friction
                    velocity.x *= friction;
                    velocity.y *= friction;
                } else {
                    velocity = { x: 0, y: 0 };
                }
            }

            // 2. Lerp: Move Current towards Target
            // Recalculate dists (target might have moved due to inertia)
            const distK = targetTransform.k - currentTransform.k; // use fresh var name to avoid confusion
            const distX = targetTransform.x - currentTransform.x;
            const distY = targetTransform.y - currentTransform.y;

            // Check if settled
            if (!isDragging && Math.abs(velocity.x) < velocityThreshold && Math.abs(velocity.y) < velocityThreshold && 
                Math.abs(distK) < epsilon && Math.abs(distX) < epsilon && Math.abs(distY) < epsilon) {
                
                // Snap to target
                currentTransform = targetTransform;
                isAnimating = false;
                
                // Final render
                g.attr("transform", currentTransform.toString());
                cachedZoomTransform = currentTransform;
                // Sync D3 state when settled to ensure next drag starts correctly
                if (!isDragging) zoom.transform(svg, currentTransform);
                
                saveTransform(currentTransform);
                return;
            }

            // Update current via Lerp
            const nextK = currentTransform.k + distK * dampingK;
            const nextX = currentTransform.x + distX * dampingXY;
            const nextY = currentTransform.y + distY * dampingXY;

            currentTransform = d3.zoomIdentity.translate(nextX, nextY).scale(nextK);

            // 3. Render
            g.attr("transform", currentTransform.toString());
            cachedZoomTransform = currentTransform;

            // Sync D3 state continuously during animation so drag starts from correct position
            if (!isDragging) zoom.transform(svg, currentTransform);

            // 4. Update text visibility
            if (currentTransform.k < params.textThreshold) {
                graphDiv.classList.add("zk-text-hidden");
            } else {
                graphDiv.classList.remove("zk-text-hidden");
            }

            if (isAnimating) {
                requestAnimationFrame(tick);
            }
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
            .style("stroke-width", `${params.lineWidth}px`)
            .style("transition", "stroke 0.2s, stroke-width 0.2s");

        const node = g.selectAll(".node")
            .data(root.descendants())
            .enter().append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.y},${d.x})`);

        node.append("circle")
            .attr("r", params.nodeRadius)
            .style("fill", d => {
                if (d.data._children) return params.foldingNodeColor; // Folded color (Priority 1)
                if (options.highlightID && d.data.IDStr === options.highlightID) return params.highlightNodeColor; // Highlight color (Priority 2)
                return d.data.IDStr.startsWith(rootNode.IDStr) ? params.nodeColor : "var(--background-secondary)"; // Default color (Priority 3)
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
            // .style("opacity", ...) managed by CSS class on graphDiv
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
                 .style("stroke", params.highlightLineColor)
                 .style("stroke-width", `${Math.max(3, params.lineWidth + 1.5)}px`);

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
                 .style("stroke-width", `${params.lineWidth}px`);
        });
    }
}
