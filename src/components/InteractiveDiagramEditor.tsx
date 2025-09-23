import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, Type, Trash2, Save, RotateCw, ZoomIn, ZoomOut, MousePointer, Square, ArrowRight, Copy, Scissors, ClipboardPaste, Undo2, Redo2, Grid3X3, Eye, EyeOff } from "lucide-react";

interface InteractiveDiagramEditorProps {
  xml: string;
  onXmlUpdate: (xml: string) => void;
  className?: string;
  imageFile?: File;
}

type Point = { x: number; y: number };

interface DiagramElement {
  id: string;
  type: 'vertex' | 'edge';
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  style: string;
  source?: string;
  target?: string;
  points?: Point[];
  rotation?: number;
}

export const InteractiveDiagramEditor = ({ xml, onXmlUpdate, className, imageFile }: InteractiveDiagramEditorProps) => {
  const [elements, setElements] = useState<DiagramElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<string>("");
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState("");
  const [rotationCenter, setRotationCenter] = useState<Point>({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string | null } | null>(null);
  const [clipboard, setClipboard] = useState<DiagramElement | null>(null);
  const [history, setHistory] = useState<DiagramElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Zoom and pan state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Background image
  const [imageUrl, setImageUrl] = useState<string>("");

  // UI enhancements
  const [currentTool, setCurrentTool] = useState<'select' | 'add-block' | 'add-arrow'>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [showImage, setShowImage] = useState(true);
  const [arrowSource, setArrowSource] = useState<string | null>(null);

  // Helper function to escape HTML tags for SVG text display
  const processText = (text: string): string => {
    // Escape HTML tags so they display as text in SVG
    return text.replace(/</g, '<').replace(/>/g, '>');
  };

  // Parse XML into elements
  const parseXmlToElements = useCallback((xmlString: string): DiagramElement[] => {
    if (!xmlString) return [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, "text/xml");
      const cells = Array.from(doc.getElementsByTagName("mxCell"));
      const parsedElements: DiagramElement[] = [];

      for (const cell of cells) {
        const id = cell.getAttribute("id") || "";
        if (id === "0" || id === "1") continue;

        const value = cell.getAttribute("value") || "";
        const style = cell.getAttribute("style") || "";
        const isEdge = cell.getAttribute("edge") === "1";
        const geometry = cell.getElementsByTagName("mxGeometry")[0];

        if (isEdge) {
          const source = cell.getAttribute("source") || "";
          const target = cell.getAttribute("target") || "";
          const points: Point[] = [];

          const array = cell.getElementsByTagName("Array")[0];
          if (array) {
            const pointsElements = array.getElementsByTagName("mxPoint");
            for (const point of Array.from(pointsElements)) {
              const x = parseFloat(point.getAttribute("x") || "0");
              const y = parseFloat(point.getAttribute("y") || "0");
              points.push({ x, y });
            }
          }

          let x = 0, y = 0, width = 0, height = 0;
          const sourcePoint = cell.querySelector('mxPoint[as="sourcePoint"]');
          const targetPoint = cell.querySelector('mxPoint[as="targetPoint"]');

          if (sourcePoint && targetPoint) {
            const sx = parseFloat(sourcePoint.getAttribute("x") || "0");
            const sy = parseFloat(sourcePoint.getAttribute("y") || "0");
            const tx = parseFloat(targetPoint.getAttribute("x") || "0");
            const ty = parseFloat(targetPoint.getAttribute("y") || "0");
            x = Math.min(sx, tx);
            y = Math.min(sy, ty);
            width = Math.abs(tx - sx);
            height = Math.abs(ty - sy);
          }

          parsedElements.push({
            id,
            type: 'edge',
            x,
            y,
            width,
            height,
            value,
            style,
            source,
            target,
            points
          });
        } else if (geometry) {
          const x = parseFloat(geometry.getAttribute("x") || "0");
          const y = parseFloat(geometry.getAttribute("y") || "0");
          const width = parseFloat(geometry.getAttribute("width") || "120");
          const height = parseFloat(geometry.getAttribute("height") || "60");

          parsedElements.push({
            id,
            type: 'vertex',
            x,
            y,
            width,
            height,
            value,
            style
          });
        }
      }

      return parsedElements;
    } catch (err) {
      console.error("Failed to parse XML:", err);
      return [];
    }
  }, []);

  // Convert elements back to XML (adds new cells if missing)
  const elementsToXml = useCallback((elements: DiagramElement[]): string => {
    if (!xml) return xml;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "text/xml");
      const model = doc.getElementsByTagName("mxGraphModel")[0];
      const root = doc.getElementsByTagName("root")[0] || model;

      // Collect existing IDs
      const existingIds = new Set<string>();
      const cells = Array.from(doc.getElementsByTagName("mxCell"));
      for (const c of cells) {
        const id = c.getAttribute("id");
        if (id) existingIds.add(id);
      }

      for (const el of elements) {
        let cell = doc.querySelector(`mxCell[id="${el.id}"]`);

        if (!cell) {
          // Create new cell if it doesn't exist in XML
          cell = doc.createElement("mxCell");
          cell.setAttribute("id", el.id);
          cell.setAttribute("parent", "1");

          if (el.type === 'vertex') {
            cell.setAttribute("vertex", "1");
            if (el.style) cell.setAttribute("style", el.style);
            if (el.value != null) cell.setAttribute("value", el.value);

            const geom = doc.createElement("mxGeometry");
            geom.setAttribute("x", String(el.x));
            geom.setAttribute("y", String(el.y));
            geom.setAttribute("width", String(el.width));
            geom.setAttribute("height", String(el.height));
            geom.setAttribute("as", "geometry");
            cell.appendChild(geom);
          } else {
            // edge
            cell.setAttribute("edge", "1");
            if (el.style) cell.setAttribute("style", el.style);
            if (el.source) cell.setAttribute("source", el.source);
            if (el.target) cell.setAttribute("target", el.target);

            const geom = doc.createElement("mxGeometry");
            geom.setAttribute("relative", "1");
            geom.setAttribute("as", "geometry");

            // Use points if provided; otherwise derive from x/y/width/height
            const points = el.points && el.points.length > 0
              ? el.points
              : [
                  { x: el.x, y: el.y },
                  { x: el.x + el.width, y: el.y + el.height }
                ];

            const src = doc.createElement("mxPoint");
            src.setAttribute("x", String(points[0].x));
            src.setAttribute("y", String(points[0].y));
            src.setAttribute("as", "sourcePoint");
            geom.appendChild(src);

            const tgt = doc.createElement("mxPoint");
            tgt.setAttribute("x", String(points[points.length - 1].x));
            tgt.setAttribute("y", String(points[points.length - 1].y));
            tgt.setAttribute("as", "targetPoint");
            geom.appendChild(tgt);

            // Intermediate waypoints
            if (points.length > 2) {
              const arr = doc.createElement("Array");
              arr.setAttribute("as", "points");
              for (let i = 1; i < points.length - 1; i++) {
                const p = doc.createElement("mxPoint");
                p.setAttribute("x", String(points[i].x));
                p.setAttribute("y", String(points[i].y));
                arr.appendChild(p);
              }
              geom.appendChild(arr);
            }

            cell.appendChild(geom);
          }

          // Append to root
          root.appendChild(cell);
        } else {
          // Update existing cell geometry and value
          const geometry = cell.getElementsByTagName("mxGeometry")[0] || doc.createElement("mxGeometry");
          if (el.type === 'vertex') {
            geometry.setAttribute("x", String(el.x));
            geometry.setAttribute("y", String(el.y));
            geometry.setAttribute("width", String(el.width));
            geometry.setAttribute("height", String(el.height));
            geometry.setAttribute("as", "geometry");
            if (!cell.contains(geometry)) cell.appendChild(geometry);
            cell.setAttribute("value", el.value || "");
            if (el.style) cell.setAttribute("style", el.style);
          } else {
            // edge geometry updates
            geometry.setAttribute("relative", "1");
            geometry.setAttribute("as", "geometry");

            // Clear existing points
            Array.from(geometry.querySelectorAll('mxPoint, Array')).forEach(n => n.parentNode?.removeChild(n));

            const points = el.points && el.points.length > 0
              ? el.points
              : [
                  { x: el.x, y: el.y },
                  { x: el.x + el.width, y: el.y + el.height }
                ];

            const src = doc.createElement("mxPoint");
            src.setAttribute("x", String(points[0].x));
            src.setAttribute("y", String(points[0].y));
            src.setAttribute("as", "sourcePoint");
            geometry.appendChild(src);

            const tgt = doc.createElement("mxPoint");
            tgt.setAttribute("x", String(points[points.length - 1].x));
            tgt.setAttribute("y", String(points[points.length - 1].y));
            tgt.setAttribute("as", "targetPoint");
            geometry.appendChild(tgt);

            if (points.length > 2) {
              const arr = doc.createElement("Array");
              arr.setAttribute("as", "points");
              for (let i = 1; i < points.length - 1; i++) {
                const p = doc.createElement("mxPoint");
                p.setAttribute("x", String(points[i].x));
                p.setAttribute("y", String(points[i].y));
                arr.appendChild(p);
              }
              geometry.appendChild(arr);
            }

            if (!cell.contains(geometry)) cell.appendChild(geometry);
            if (el.style) cell.setAttribute("style", el.style);
            if (el.source) cell.setAttribute("source", el.source);
            if (el.target) cell.setAttribute("target", el.target);
          }
        }
      }

      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc);
    } catch (err) {
      console.error("Failed to convert elements to XML:", err);
      return xml;
    }
  }, [xml]);

  useEffect(() => {
    const parsedElements = parseXmlToElements(xml);
    setElements(parsedElements);
    // Initialize history with initial state
    setHistory([parsedElements]);
    setHistoryIndex(0);
  }, [xml, parseXmlToElements]);

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImageUrl("");
    }
  }, [imageFile]);

  // Keyboard handling for space bar panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditingText) {
        e.preventDefault();
        // Space bar handling is done in mouse events
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Handle any key up events if needed
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isEditingText]);

  const updateXml = useCallback((snapshot?: DiagramElement[]) => {
    const source = snapshot ?? elements;
    const newXml = elementsToXml(source);
    onXmlUpdate(newXml);
  }, [elements, elementsToXml, onXmlUpdate]);

  const handleElementClick = (elementId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (currentTool === 'add-arrow') {
      if (arrowSource === null) {
        // First click: set source
        setArrowSource(elementId);
        setSelectedElement(elementId);
      } else if (arrowSource === elementId) {
        // Clicked same element: deselect
        setArrowSource(null);
        setSelectedElement(null);
      } else {
        // Second click: create arrow
        addArrow(arrowSource, elementId);
        setArrowSource(null);
        setSelectedElement(elementId);
      }
    } else {
      setSelectedElement(elementId);
      setArrowSource(null); // Reset arrow mode
    }
  };

  const handleElementContextMenu = (elementId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedElement(elementId);
    handleContextMenu(event, elementId);
  };

  const handleCanvasClick = (event: React.MouseEvent) => {
    if (currentTool === 'add-block') {
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const x = (event.clientX - rect.left - pan.x) / scale;
      const y = (event.clientY - rect.top - pan.y) / scale;
      addBlock(x, y);
    } else {
      setSelectedElement(null);
      setIsEditingText(false);
      setArrowSource(null); // Reset arrow mode
    }
  };

  const startDrag = (elementId: string, event: React.MouseEvent) => {
    if (isEditingText) return;
    event.stopPropagation();
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    setIsDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
    setDragOffset({ x: element.x, y: element.y });
  };

  const startPan = (event: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: event.clientX - pan.x, y: event.clientY - pan.y });
  };

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPan({
        x: event.clientX - panStart.x,
        y: event.clientY - panStart.y
      });
      return;
    }

    if (!isDragging || !selectedElement) return;

    // Calculate movement delta and apply it directly
    const deltaX = (event.clientX - dragStart.x) / scale;
    const deltaY = (event.clientY - dragStart.y) / scale;

    const newX = dragOffset.x + deltaX;
    const newY = dragOffset.y + deltaY;

    setElements(prev => prev.map(el =>
      el.id === selectedElement
        ? { ...el, x: newX, y: newY }
        : el
    ));
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (isDragging) {
      setIsDragging(false);
      const snapshot = [...elements];
      updateXml(snapshot);
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(snapshot.map(el => ({ ...el })));
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const handleMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    // Check for panning (space + drag or middle mouse)
    if (event.button === 1 || (event.button === 0 && event.altKey)) { // middle mouse or alt+left mouse
      startPan(event);
      return;
    }
  };

  const startResize = (handle: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setIsResizing(true);
    setResizeHandle(handle);
  };

  const startRotate = (event: React.MouseEvent) => {
    if (!selectedElement) return;
    event.stopPropagation();
    const element = elements.find(el => el.id === selectedElement);
    if (!element) return;

    setIsRotating(true);
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    setRotationCenter({ x: centerX, y: centerY });
  };

  const handleResizeMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isResizing || !selectedElement) return;

    const element = elements.find(el => el.id === selectedElement);
    if (!element) return;

    const rect = event.currentTarget.getBoundingClientRect();
    // Adjust for scale and pan
    const mouseX = (event.clientX - rect.left - pan.x) / scale;
    const mouseY = (event.clientY - rect.top - pan.y) / scale;

    let newX = element.x;
    let newY = element.y;
    let newWidth = element.width;
    let newHeight = element.height;

    switch (resizeHandle) {
      case 'nw':
        newX = mouseX;
        newY = mouseY;
        newWidth = element.x + element.width - mouseX;
        newHeight = element.y + element.height - mouseY;
        break;
      case 'ne':
        newY = mouseY;
        newWidth = mouseX - element.x;
        newHeight = element.y + element.height - mouseY;
        break;
      case 'se':
        newWidth = mouseX - element.x;
        newHeight = mouseY - element.y;
        break;
      case 'sw':
        newX = mouseX;
        newWidth = element.x + element.width - mouseX;
        newHeight = mouseY - element.y;
        break;
    }

    setElements(prev => prev.map(el =>
      el.id === selectedElement
        ? { ...el, x: newX, y: newY, width: Math.max(20, newWidth), height: Math.max(20, newHeight) }
        : el
    ));
  };

  const handleResizeUp = () => {
    if (isResizing) {
      setIsResizing(false);
      setResizeHandle("");
      updateXml();
      saveToHistory();
    }
  };

  const handleRotateMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isRotating || !selectedElement) return;

    const element = elements.find(el => el.id === selectedElement);
    if (!element) return;

    const rect = event.currentTarget.getBoundingClientRect();
    // Adjust for scale and pan
    const mouseX = (event.clientX - rect.left - pan.x) / scale;
    const mouseY = (event.clientY - rect.top - pan.y) / scale;

    const angle = Math.atan2(mouseY - rotationCenter.y, mouseX - rotationCenter.x) * (180 / Math.PI);
    const normalizedAngle = ((angle % 360) + 360) % 360;

    setElements(prev => prev.map(el =>
      el.id === selectedElement
        ? { ...el, rotation: normalizedAngle }
        : el
    ));
  };

  const handleRotateUp = () => {
    if (!isRotating || !selectedElement) return;
    setIsRotating(false);
    // Build snapshot with current rotation applied (already set in state during move)
    const snapshot = [...elements];
    updateXml(snapshot);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snapshot.map(el => ({ ...el })));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const startEditText = () => {
    if (!selectedElement) return;
    const element = elements.find(el => el.id === selectedElement);
    if (element) {
      setEditText(element.value);
      setIsEditingText(true);
    }
  };

  const saveTextEdit = () => {
    if (!selectedElement) return;
    // Build updated elements snapshot to avoid stale state when saving
    const updated = elements.map(el =>
      el.id === selectedElement ? { ...el, value: editText } : el
    );
    setElements(updated);
    setIsEditingText(false);
    // Persist XML and history using the fresh snapshot
    updateXml(updated);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...updated]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const deleteSelected = () => {
    if (!selectedElement) return;
    setElements(prev => prev.filter(el => el.id !== selectedElement));
    setSelectedElement(null);
    updateXml();
    saveToHistory();
  };

  const rotateSelected = () => {
    if (!selectedElement) return;
    const updated = elements.map(el =>
      el.id === selectedElement
        ? { ...el, rotation: ((el.rotation || 0) + 90) % 360 }
        : el
    );
    setElements(updated);
    updateXml(updated);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...updated]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const copySelected = () => {
    if (!selectedElement) return;
    const element = elements.find(el => el.id === selectedElement);
    if (element) {
      setClipboard({ ...element });
    }
  };

  const cutSelected = () => {
    copySelected();
    deleteSelected();
  };

  const pasteElement = () => {
    if (!clipboard) return;
    const newElement: DiagramElement = {
      ...clipboard,
      id: `pasted_${Date.now()}_${Math.random()}`,
      x: clipboard.x + 20,
      y: clipboard.y + 20
    };
    const updated = [...elements, newElement];
    setElements(updated);
    setSelectedElement(newElement.id);
    updateXml(updated); // persist snapshot immediately
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...updated]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const addArrow = (sourceId: string, targetId: string) => {
    const sourceElement = elements.find(el => el.id === sourceId);
    const targetElement = elements.find(el => el.id === targetId);
    if (!sourceElement || !targetElement) return;

    const newArrow: DiagramElement = {
      id: `arrow_${Date.now()}_${Math.random()}`,
      type: 'edge',
      x: Math.min(sourceElement.x + sourceElement.width / 2, targetElement.x + targetElement.width / 2),
      y: Math.min(sourceElement.y + sourceElement.height / 2, targetElement.y + targetElement.height / 2),
      width: Math.abs((sourceElement.x + sourceElement.width / 2) - (targetElement.x + targetElement.width / 2)),
      height: Math.abs((sourceElement.y + sourceElement.height / 2) - (targetElement.y + targetElement.height / 2)),
      value: '',
      style: 'edgeStyle=orthogonalEdgeStyle;',
      source: sourceId,
      target: targetId,
      points: [
        { x: sourceElement.x + sourceElement.width / 2, y: sourceElement.y + sourceElement.height / 2 },
        { x: targetElement.x + targetElement.width / 2, y: targetElement.y + targetElement.height / 2 }
      ]
    };
    const updated = [...elements, newArrow];
    setElements(updated);
    updateXml(updated);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...updated]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const addBlock = (x: number, y: number) => {
    const newBlock: DiagramElement = {
      id: `block_${Date.now()}_${Math.random()}`,
      type: 'vertex',
      x: x - 60, // Center on click
      y: y - 30,
      width: 120,
      height: 60,
      value: 'New Block',
      style: 'shape=rectangle;fillColor=#ffffff;strokeColor=#000000;'
    };
    const updated = [...elements, newBlock];
    setElements(updated);
    setSelectedElement(newBlock.id);
    updateXml(updated);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...updated]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleContextMenu = (event: React.MouseEvent, elementId?: string) => {
    event.preventDefault();
    const componentRect = (event.currentTarget as HTMLElement).closest('.relative')?.getBoundingClientRect();
    if (componentRect) {
      setContextMenu({
        x: event.clientX - componentRect.left,
        y: event.clientY - componentRect.top,
        elementId: elementId || selectedElement
      });
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const saveToHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...elements]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [elements, history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevElements = history[historyIndex - 1];
      setElements([...prevElements]);
      setHistoryIndex(historyIndex - 1);
      updateXml();
    }
  }, [history, historyIndex, updateXml]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextElements = history[historyIndex + 1];
      setElements([...nextElements]);
      setHistoryIndex(historyIndex + 1);
      updateXml();
    }
  }, [history, historyIndex, updateXml]);

  // Zoom functions
  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.25));
  const handleResetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // Handle mouse wheel: pan by default; Ctrl+wheel to zoom
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();

    if (e.ctrlKey) {
      // Zoom
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(3, Math.max(0.25, scale * factor));

      // Zoom to cursor position
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - ((mouseX - pan.x) * newScale) / scale;
      const newPanY = mouseY - ((mouseY - pan.y) * newScale) / scale;

      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    } else {
      // Pan using wheel/trackpad scroll deltas
      setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const renderElement = (element: DiagramElement) => {
    const isSelected = selectedElement === element.id;

    if (element.type === 'edge') {
      // Render edge (simplified as line for now)
      const centerX = element.x + element.width / 2;
      const centerY = element.y + element.height / 2;

      return (
        <g key={element.id}>
          <line
            x1={element.x}
            y1={element.y}
            x2={element.x + element.width}
            y2={element.y + element.height}
            stroke="#333"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
            onClick={(e) => handleElementClick(element.id, e)}
            onContextMenu={(e) => handleElementContextMenu(element.id, e)}
            style={{ cursor: isSelected ? 'move' : 'pointer' }}
            onMouseDown={(e) => {
              if (e.button === 0) startDrag(element.id, e);
            }}
          />
          {isSelected && (
            <>
              <rect
                x={element.x - 5}
                y={element.y - 5}
                width={element.width + 10}
                height={element.height + 10}
                fill="none"
                stroke="#007bff"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
              {/* Rotation handle for edges */}
              <circle cx={centerX} cy={element.y - 20} r="6" fill="#ff6b6b" onMouseDown={startRotate} style={{ cursor: 'crosshair' }} />
              <line x1={centerX} y1={element.y} x2={centerX} y2={element.y - 20} stroke="#ff6b6b" strokeWidth="2" />
            </>
          )}
        </g>
      );
    }

    // Render vertex
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const rotation = element.rotation || 0;

    return (
      <g key={element.id}>
        <g transform={`rotate(${rotation} ${centerX} ${centerY})`}>
          <rect
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            fill="#f0f0f0"
            stroke="#333"
            strokeWidth="2"
            rx="8"
            onClick={(e) => handleElementClick(element.id, e)}
            onContextMenu={(e) => handleElementContextMenu(element.id, e)}
            onMouseDown={(e) => startDrag(element.id, e)}
            style={{ cursor: isSelected ? 'move' : 'pointer' }}
          />
          {element.value && (
            <foreignObject
              x={element.x + 4}
              y={element.y + 4}
              width={element.width - 8}
              height={element.height - 8}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  color: '#333',
                  fontFamily: 'Arial, sans-serif',
                  textAlign: 'center',
                  overflow: 'hidden',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}
                dangerouslySetInnerHTML={{ __html: element.value.replace(/</g, '<').replace(/>/g, '>') }}
              />
            </foreignObject>
          )}
          {isSelected && (
            <>
              {/* Selection border */}
              <rect
                x={element.x - 2}
                y={element.y - 2}
                width={element.width + 4}
                height={element.height + 4}
                fill="none"
                stroke="#007bff"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
              {/* Resize handles */}
              <circle cx={element.x} cy={element.y} r="6" fill="#007bff" onMouseDown={(e) => startResize('nw', e)} style={{ cursor: 'nw-resize' }} />
              <circle cx={element.x + element.width} cy={element.y} r="6" fill="#007bff" onMouseDown={(e) => startResize('ne', e)} style={{ cursor: 'ne-resize' }} />
              <circle cx={element.x + element.width} cy={element.y + element.height} r="6" fill="#007bff" onMouseDown={(e) => startResize('se', e)} style={{ cursor: 'se-resize' }} />
              <circle cx={element.x} cy={element.y + element.height} r="6" fill="#007bff" onMouseDown={(e) => startResize('sw', e)} style={{ cursor: 'sw-resize' }} />
            </>
          )}
        </g>
        {isSelected && (
          <>
            {/* Rotation handle - outside rotation transform */}
            <circle cx={centerX} cy={element.y - 20} r="6" fill="#ff6b6b" onMouseDown={startRotate} style={{ cursor: 'crosshair' }} />
            <line x1={centerX} y1={element.y} x2={centerX} y2={element.y - 20} stroke="#ff6b6b" strokeWidth="2" />
          </>
        )}
      </g>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Top Toolbar */}
      <div className="flex items-center justify-between bg-white border-b px-4 py-2 shadow-sm">
        <div className="flex items-center gap-4">
          {/* Tools */}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={currentTool === 'select' ? 'default' : 'outline'}
              onClick={() => setCurrentTool('select')}
              title="Select Tool (V)"
            >
              <MousePointer className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={currentTool === 'add-block' ? 'default' : 'outline'}
              onClick={() => setCurrentTool('add-block')}
              title="Add Block"
            >
              <Square className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={currentTool === 'add-arrow' ? 'default' : 'outline'}
              onClick={() => setCurrentTool('add-arrow')}
              title="Add Arrow"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Edit Actions */}
          {selectedElement && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={startEditText} title="Rename">
                <Type className="w-4 h-4 mr-1" />
                Rename
              </Button>
              <Button size="sm" variant="outline" onClick={rotateSelected} title="Rotate 90°">
                <RotateCw className="w-4 h-4 mr-1" />
                Rotate
              </Button>
              <Button size="sm" variant="outline" onClick={deleteSelected} title="Delete">
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </div>
          )}

          {/* Clipboard */}
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={copySelected} disabled={!selectedElement} title="Copy">
              <Copy className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={cutSelected} disabled={!selectedElement} title="Cut">
              <Scissors className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={pasteElement} disabled={!clipboard} title="Paste">
              <ClipboardPaste className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <Button size="sm" variant="outline" onClick={undo} disabled={historyIndex <= 0} title="Undo">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo">
            <Redo2 className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* View Options */}
          <Button size="sm" variant="outline" onClick={() => setShowGrid(!showGrid)} title="Toggle Grid">
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowImage(!showImage)} disabled={!imageUrl} title="Toggle Background">
            {showImage ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Zoom */}
          <Button size="sm" variant="outline" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm px-2 min-w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button size="sm" variant="outline" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={handleResetView} title="Reset View">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 relative">
        {/* Canvas Area */}
        <div className="flex-1 relative">
          {/* Text editing overlay */}
          {isEditingText && selectedElement && (
            <div className="absolute top-4 left-4 z-20 bg-white p-3 border rounded-lg shadow-lg">
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTextEdit();
                  if (e.key === 'Escape') setIsEditingText(false);
                }}
                autoFocus
                className="w-64"
                placeholder="Enter new name"
              />
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={saveTextEdit}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditingText(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* SVG Canvas */}
          <svg
            width="100%"
            height="100%"
            className={showImage && imageUrl ? "bg-transparent" : "bg-gray-50"}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={isDragging ? handleMouseMove : isResizing ? handleResizeMove : isRotating ? handleRotateMove : isPanning ? handleMouseMove : undefined}
            onMouseUp={isDragging ? handleMouseUp : isResizing ? handleResizeUp : isRotating ? handleRotateUp : isPanning ? handleMouseUp : undefined}
            onWheel={handleWheel}
            style={{
              cursor: currentTool === 'add-block' ? 'crosshair' :
                     currentTool === 'add-arrow' ? 'crosshair' :
                     isDragging ? 'grabbing' :
                     isResizing ? 'crosshair' :
                     isRotating ? 'crosshair' :
                     isPanning ? 'grabbing' : 'default'
            }}
          >
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e0e0e0" strokeWidth="1"/>
              </pattern>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
              </marker>
            </defs>

            {/* Grid background */}
            {showGrid && (
              <rect width="100%" height="100%" fill="url(#grid)" />
            )}

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* Background image - show architecture at full opacity */}
              {imageUrl && showImage && (
                <image
                  href={imageUrl}
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  opacity="1"
                  pointerEvents="none"
                  preserveAspectRatio="xMidYMid meet"
                />
              )}
              {elements.map(renderElement)}
            </g>
          </svg>

          {/* Context Menu */}
          {contextMenu && (
            <div
              className="absolute z-50 bg-white border border-gray-300 rounded-lg shadow-lg py-2 min-w-40 text-black"
              style={{
                left: contextMenu.x + 10,
                top: contextMenu.y + 10
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                onClick={() => {
                  copySelected();
                  closeContextMenu();
                }}
                disabled={!contextMenu.elementId}
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                onClick={() => {
                  cutSelected();
                  closeContextMenu();
                }}
                disabled={!contextMenu.elementId}
              >
                <Scissors className="w-4 h-4" />
                Cut
              </button>
              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                onClick={() => {
                  pasteElement();
                  closeContextMenu();
                }}
                disabled={!clipboard}
              >
                <ClipboardPaste className="w-4 h-4" />
                Paste
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                onClick={() => {
                  rotateSelected();
                  closeContextMenu();
                }}
                disabled={!contextMenu.elementId}
              >
                <RotateCw className="w-4 h-4" />
                Rotate 90°
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                onClick={() => {
                  deleteSelected();
                  closeContextMenu();
                }}
                disabled={!contextMenu.elementId}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}

          {/* Overlay to close context menu */}
          {contextMenu && (
            <div
              className="absolute inset-0 z-40"
              onClick={closeContextMenu}
              onContextMenu={(e) => {
                e.preventDefault();
                closeContextMenu();
              }}
            />
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between bg-gray-100 border-t px-4 py-1 text-sm text-gray-600">
        <div className="flex items-center gap-4">
          <span>
            {currentTool === 'select' ? 'Select' :
             currentTool === 'add-block' ? 'Add Block (click on canvas)' :
             currentTool === 'add-arrow' ? arrowSource ? 'Click target block to add arrow' : 'Click source block to start arrow' :
             'Tool'}
          </span>
          {selectedElement && (
            <span>
              Selected: {elements.find(el => el.id === selectedElement)?.value || selectedElement}
            </span>
          )}
        </div>
        <div>
          Elements: {elements.length} | Pan: {Math.round(pan.x)}, {Math.round(pan.y)}
        </div>
      </div>
    </div>
  );
};