import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, Type, Trash2, Save, RotateCw, ZoomIn, ZoomOut, MousePointer, Square, ArrowRight, Copy, Scissors, ClipboardPaste, Undo2, Redo2, Grid3X3, Eye, EyeOff, ChevronDown, ChevronRight, Circle, Triangle, Diamond, Hexagon, Star, Move, ChevronUp } from "lucide-react";

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
  const [currentTool, setCurrentTool] = useState<'select' | 'add-block' | 'add-arrow' | 'drag'>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [showImage, setShowImage] = useState(true);
  const [arrowSource, setArrowSource] = useState<string | null>(null);
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<{[key: string]: boolean}>({
    general: false,
    shapes: true,
    arrows: true,
    styles: true,
    advanced: true
  });
  const [selectedShape, setSelectedShape] = useState<string>('rectangle');
  const [selectedArrowType, setSelectedArrowType] = useState<string>('straight');
  
  // Drag state for edges and vertices
  const [dragMode, setDragMode] = useState<'element' | 'edge-point' | 'edge-whole'>('element');
  const [dragPointIndex, setDragPointIndex] = useState<number | null>(null);
  const [initialEdgePoints, setInitialEdgePoints] = useState<Point[] | null>(null);
  
  // Rotate helpers for edges
  const [initialRotatePoints, setInitialRotatePoints] = useState<Point[] | null>(null);
  const [rotateStartAngle, setRotateStartAngle] = useState<number | null>(null);
  
  // Sidebar scrolling
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

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

      // Collect existing IDs and remove cells not present in current elements
      const cells = Array.from(doc.getElementsByTagName("mxCell"));
      const existingIds = new Set<string>();
      for (const c of cells) {
        const id = c.getAttribute("id");
        if (id) existingIds.add(id);
      }
      const keepIds = new Set<string>(["0", "1", ...elements.map(e => e.id)]);
      for (const c of cells) {
        const id = c.getAttribute("id") || "";
        if (id && !keepIds.has(id)) {
          c.parentNode?.removeChild(c);
        }
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

  // Sidebar scroll functions
  const checkScrollPosition = useCallback(() => {
    if (sidebarRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = sidebarRef.current;
      setCanScrollUp(scrollTop > 0);
      setCanScrollDown(scrollTop < scrollHeight - clientHeight - 1);
    }
  }, []);

  const scrollSidebarUp = () => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollBy({
        top: -100,
        behavior: 'smooth'
      });
      setTimeout(checkScrollPosition, 300);
    }
  };

  const scrollSidebarDown = () => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollBy({
        top: 100,
        behavior: 'smooth'
      });
      setTimeout(checkScrollPosition, 300);
    }
  };

  // Initialize scroll position check and add scroll listener
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (sidebar) {
      checkScrollPosition();
      sidebar.addEventListener('scroll', checkScrollPosition);
      
      // Also check on resize
      const resizeObserver = new ResizeObserver(checkScrollPosition);
      resizeObserver.observe(sidebar);
      
      return () => {
        sidebar.removeEventListener('scroll', checkScrollPosition);
        resizeObserver.disconnect();
      };
    }
  }, [checkScrollPosition]);

  // Check scroll position when sidebar sections are toggled
  useEffect(() => {
    setTimeout(checkScrollPosition, 100);
  }, [sidebarCollapsed, checkScrollPosition]);

  const updateXml = useCallback((snapshot?: DiagramElement[]) => {
    const source = snapshot ?? elements;
    const newXml = elementsToXml(source);
    onXmlUpdate(newXml);
  }, [elements, elementsToXml, onXmlUpdate]);

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

  // Keyboard handling for space bar panning and shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingText) return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        // Space bar handling is done in mouse events
      } else if (e.key === 'Escape') {
        setCurrentTool('select');
        setArrowSource(null);
        setSelectedElement(null);
      } else if (e.key === 'v' || e.key === 'V') {
        setCurrentTool('select');
      } else if (e.key === 'b' || e.key === 'B') {
        setCurrentTool('add-block');
      } else if (e.key === 'a' || e.key === 'A') {
        setCurrentTool('add-arrow');
      } else if (e.key === 'd' || e.key === 'D') {
        setCurrentTool('drag');
      } else if (e.key === 'Delete' && selectedElement) {
        // Inline delete logic to avoid circular dependency
        setElements(prevElements => {
          const filtered = prevElements.filter(el => el.id !== selectedElement);
          const cleaned = pruneDanglingEdges(filtered);
          // Update XML and history
          const newXml = elementsToXml(cleaned);
          onXmlUpdate(newXml);
          setHistory(prevHistory => {
            const newHistory = prevHistory.slice(0, historyIndex + 1);
            newHistory.push([...cleaned]);
            setHistoryIndex(newHistory.length - 1);
            return newHistory;
          });
          return cleaned;
        });
        setSelectedElement(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
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
  }, [isEditingText, selectedElement, undo, redo, elementsToXml, onXmlUpdate, historyIndex]);

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
    const element = elements.find(el => el.id === elementId);
    setSelectedElement(elementId);
    if (element?.type !== 'edge') {
      handleContextMenu(event, elementId);
    }
    // For edges, just select and show edit handles without context menu
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

  const startDrag = (elementId: string, event: React.MouseEvent, options?: { edgePointIndex?: number; wholeEdge?: boolean }) => {
    if (isEditingText) return;
    event.stopPropagation();
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    setIsDragging(true);
    setSelectedElement(elementId);
    setDragStart({ x: event.clientX, y: event.clientY });

    if (element.type === 'edge') {
      // Setup edge drag
      const pts = (element.points && element.points.length > 0)
        ? element.points.map(p => ({ ...p }))
        : [
            { x: element.x, y: element.y },
            { x: element.x + element.width, y: element.y + element.height }
          ];
      setInitialEdgePoints(pts);

      if (options?.wholeEdge) {
        setDragMode('edge-whole');
      } else if (typeof options?.edgePointIndex === 'number') {
        setDragMode('edge-point');
        setDragPointIndex(options.edgePointIndex);
      } else {
        // default: whole edge if clicked on path
        setDragMode('edge-whole');
      }
      setDragOffset({ x: 0, y: 0 });
    } else {
      // Vertex drag
      setDragMode('element');
      setDragOffset({ x: element.x, y: element.y });
    }
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

    setElements(prev => prev.map(el => {
      if (el.id !== selectedElement) return el;
      if (el.type === 'edge') {
        // Move whole edge or a point
        const basePoints = (initialEdgePoints || []);
        if (dragMode === 'edge-whole') {
          const moved = basePoints.map(p => ({ x: p.x + deltaX, y: p.y + deltaY }));
          // Also update x/y/width/height bounds for the edge
          const minX = Math.min(...moved.map(p => p.x));
          const minY = Math.min(...moved.map(p => p.y));
          const maxX = Math.max(...moved.map(p => p.x));
          const maxY = Math.max(...moved.map(p => p.y));
          return { ...el, points: moved, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        if (dragMode === 'edge-point' && dragPointIndex != null) {
          const moved = basePoints.map((p, i) => i === dragPointIndex ? ({ x: p.x + deltaX, y: p.y + deltaY }) : p);
          const minX = Math.min(...moved.map(p => p.x));
          const minY = Math.min(...moved.map(p => p.y));
          const maxX = Math.max(...moved.map(p => p.x));
          const maxY = Math.max(...moved.map(p => p.y));
          return { ...el, points: moved, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return el;
      } else {
        // Vertex move
        const newX = dragOffset.x + deltaX;
        const newY = dragOffset.y + deltaY;
        return { ...el, x: newX, y: newY };
      }
    }));
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (isDragging) {
      setIsDragging(false);
      setDragMode('element');
      setDragPointIndex(null);
      setInitialEdgePoints(null);
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
    setResizeHandle(handle); // 'nw','ne','se','sw','n','e','s','w'
  };

  const startRotate = (event: React.MouseEvent) => {
    if (!selectedElement) return;
    event.stopPropagation();
    const element = elements.find(el => el.id === selectedElement);
    if (!element) return;

    setIsRotating(true);
    const centerX = element.type === 'edge'
      ? ((element.points && element.points.length)
          ? (Math.min(...(element.points.map(p => p.x))) + Math.max(...(element.points.map(p => p.x)))) / 2
          : element.x + element.width / 2)
      : element.x + element.width / 2;
    const centerY = element.type === 'edge'
      ? ((element.points && element.points.length)
          ? (Math.min(...(element.points.map(p => p.y))) + Math.max(...(element.points.map(p => p.y)))) / 2
          : element.y + element.height / 2)
      : element.y + element.height / 2;
    setRotationCenter({ x: centerX, y: centerY });
    // Keep a snapshot of points for smooth rotation for edges
    if (element.type === 'edge') {
      const pts = (element.points && element.points.length > 0)
        ? element.points.map(p => ({ ...p }))
        : [
            { x: element.x, y: element.y },
            { x: element.x + element.width, y: element.y + element.height }
          ];
      setInitialRotatePoints(pts);
    } else {
      setInitialRotatePoints(null);
    }
  };

  const handleResizeMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isResizing || !selectedElement) return;

    const element = elements.find(el => el.id === selectedElement);
    if (!element) return;

    const rect = event.currentTarget.getBoundingClientRect();
    // Adjust for scale and pan
    const mouseX = (event.clientX - rect.left - pan.x) / scale;
    const mouseY = (event.clientY - rect.top - pan.y) / scale;

    if (element.type === 'vertex') {
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
        case 'n':
          newY = mouseY;
          newHeight = element.y + element.height - mouseY;
          break;
        case 'ne':
          newY = mouseY;
          newWidth = mouseX - element.x;
          newHeight = element.y + element.height - mouseY;
          break;
        case 'e':
          newWidth = mouseX - element.x;
          break;
        case 'se':
          newWidth = mouseX - element.x;
          newHeight = mouseY - element.y;
          break;
        case 's':
          newHeight = mouseY - element.y;
          break;
        case 'sw':
          newX = mouseX;
          newWidth = element.x + element.width - mouseX;
          newHeight = mouseY - element.y;
          break;
        case 'w':
          newX = mouseX;
          newWidth = element.x + element.width - mouseX;
          break;
      }

      setElements(prev => prev.map(el =>
        el.id === selectedElement
          ? { ...el, x: newX, y: newY, width: Math.max(20, newWidth), height: Math.max(20, newHeight) }
          : el
      ));
    } else if (element.type === 'edge') {
      // Handle edge resizing by scaling the points
      const points = element.points && element.points.length > 0 ? element.points : [
        { x: element.x, y: element.y },
        { x: element.x + element.width, y: element.y + element.height }
      ];

      const minX = Math.min(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      const maxX = Math.max(...points.map(p => p.x));
      const maxY = Math.max(...points.map(p => p.y));
      const oldWidth = maxX - minX;
      const oldHeight = maxY - minY;

      if (oldWidth === 0 || oldHeight === 0) return;

      // Calculate new bounds as if resizing a rectangle
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
        case 'n':
          newY = mouseY;
          newHeight = element.y + element.height - mouseY;
          break;
        case 'ne':
          newY = mouseY;
          newWidth = mouseX - element.x;
          newHeight = element.y + element.height - mouseY;
          break;
        case 'e':
          newWidth = mouseX - element.x;
          break;
        case 'se':
          newWidth = mouseX - element.x;
          newHeight = mouseY - element.y;
          break;
        case 's':
          newHeight = mouseY - element.y;
          break;
        case 'sw':
          newX = mouseX;
          newWidth = element.x + element.width - mouseX;
          newHeight = mouseY - element.y;
          break;
        case 'w':
          newX = mouseX;
          newWidth = element.x + element.width - mouseX;
          break;
      }

      newWidth = Math.max(20, newWidth);
      newHeight = Math.max(20, newHeight);

      // Scale the points
      const scaleX = newWidth / oldWidth;
      const scaleY = newHeight / oldHeight;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const newCenterX = newX + newWidth / 2;
      const newCenterY = newY + newHeight / 2;

      const newPoints = points.map(p => ({
        x: newCenterX + (p.x - centerX) * scaleX,
        y: newCenterY + (p.y - centerY) * scaleY
      }));

      setElements(prev => prev.map(el =>
        el.id === selectedElement
          ? { ...el, points: newPoints, x: newX, y: newY, width: newWidth, height: newHeight }
          : el
      ));
    }
  };

  const handleResizeUp = () => {
    if (isResizing) {
      setIsResizing(false);
      setResizeHandle("");
      const snapshot = [...elements];
      updateXml(snapshot);
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(snapshot.map(el => ({ ...el })));
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
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

    if (element.type === 'edge') {
      // Rotate all points around center
      const pts = (initialRotatePoints || element.points || []).map(p => ({ ...p }));
      const rad = normalizedAngle * Math.PI / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const cx = rotationCenter.x;
      const cy = rotationCenter.y;
      const rotated = pts.map(p => ({
        x: cx + (p.x - cx) * cosA - (p.y - cy) * sinA,
        y: cy + (p.x - cx) * sinA + (p.y - cy) * cosA,
      }));
      const minX = Math.min(...rotated.map(p => p.x));
      const minY = Math.min(...rotated.map(p => p.y));
      const maxX = Math.max(...rotated.map(p => p.x));
      const maxY = Math.max(...rotated.map(p => p.y));
      setElements(prev => prev.map(el => el.id === selectedElement ? { ...el, points: rotated, x: minX, y: minY, width: maxX - minX, height: maxY - minY } : el));
    } else {
      setElements(prev => prev.map(el =>
        el.id === selectedElement
          ? { ...el, rotation: normalizedAngle }
          : el
      ));
    }
  };

  const handleRotateUp = () => {
    if (!isRotating || !selectedElement) return;
    setIsRotating(false);
    setInitialRotatePoints(null);
    setRotateStartAngle(null);
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

  // Helper to remove dangling edges that reference deleted vertices
  const pruneDanglingEdges = (els: DiagramElement[]): DiagramElement[] => {
    const vertexIds = new Set(els.filter(e => e.type === 'vertex').map(e => e.id));
    return els.filter(e => e.type === 'vertex' || (vertexIds.has(e.source || '') && vertexIds.has(e.target || '')));
  };

  const deleteSelected = useCallback(() => {
    if (!selectedElement) return;
    // Remove the selected element and any dangling edges
    const filtered = elements.filter(el => el.id !== selectedElement);
    const cleaned = pruneDanglingEdges(filtered);
    setElements(cleaned);
    setSelectedElement(null);
    // Persist using the cleaned snapshot to avoid stale state
    updateXml(cleaned);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...cleaned]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [selectedElement, elements, updateXml, history, historyIndex]);

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

  const getArrowStyle = (arrowType: string): string => {
    switch (arrowType) {
      case 'straight':
        return 'edgeStyle=straight;endArrow=classic;strokeColor=#333;strokeWidth=2;';
      case 'curved':
        return 'edgeStyle=curved;endArrow=classic;strokeColor=#333;strokeWidth=2;';
      case 'dashed':
        return 'edgeStyle=straight;strokeDashArray=5,5;endArrow=classic;strokeColor=#333;strokeWidth=2;';
      case 'double':
        return 'edgeStyle=straight;strokeWidth=3;endArrow=classic;strokeColor=#333;';
      case 'bidirectional':
        return 'edgeStyle=straight;startArrow=classic;endArrow=classic;strokeColor=#333;strokeWidth=2;';
      default:
        return 'edgeStyle=straight;endArrow=classic;strokeColor=#333;strokeWidth=2;';
    }
  };

  const addArrow = (sourceId: string, targetId: string) => {
    const sourceElement = elements.find(el => el.id === sourceId);
    const targetElement = elements.find(el => el.id === targetId);
    if (!sourceElement || !targetElement) return;

    const arrowStyle = getArrowStyle(selectedArrowType);
    const newArrow: DiagramElement = {
      id: `arrow_${Date.now()}_${Math.random()}`,
      type: 'edge',
      x: Math.min(sourceElement.x + sourceElement.width / 2, targetElement.x + targetElement.width / 2),
      y: Math.min(sourceElement.y + sourceElement.height / 2, targetElement.y + targetElement.height / 2),
      width: Math.abs((sourceElement.x + sourceElement.width / 2) - (targetElement.x + targetElement.width / 2)),
      height: Math.abs((sourceElement.y + sourceElement.height / 2) - (targetElement.y + targetElement.height / 2)),
      value: '',
      style: arrowStyle,
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

  const addArrowFromDrop = (x1: number, y1: number, x2: number, y2: number) => {
    const arrowStyle = getArrowStyle(selectedArrowType);
    const newArrow: DiagramElement = {
      id: `arrow_${Date.now()}_${Math.random()}`,
      type: 'edge',
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
      value: '',
      style: arrowStyle,
      source: '',
      target: '',
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y2 }
      ]
    };
    const updated = [...elements, newArrow];
    setElements(updated);
    setSelectedElement(newArrow.id);
    updateXml(updated);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...updated]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const toggleSidebarSection = (section: string) => {
    setSidebarCollapsed(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getShapeStyle = (shape: string): string => {
    const baseStyle = 'fillColor=#ffffff;strokeColor=#000000;strokeWidth=1;';
    switch (shape) {
      case 'rectangle':
        return `shape=rectangle;${baseStyle}`;
      case 'circle':
        return `shape=ellipse;${baseStyle}`;
      case 'diamond':
        return `shape=rhombus;${baseStyle}`;
      case 'triangle':
        return `shape=triangle;${baseStyle}`;
      case 'hexagon':
        return `shape=hexagon;${baseStyle}`;
      case 'star':
        return `shape=star;${baseStyle}`;
      case 'cylinder':
        return `shape=cylinder;${baseStyle}`;
      case 'cloud':
        return `shape=cloud;${baseStyle}`;
      case 'actor':
        return `shape=actor;${baseStyle}`;
      case 'document':
        return `shape=document;${baseStyle}`;
      case 'database':
        return `shape=cylinder;${baseStyle}`;
      case 'process':
        return `shape=parallelogram;${baseStyle}`;
      default:
        return `shape=rectangle;${baseStyle}`;
    }
  };

  const addShapeFromSidebar = (shape: string) => {
    setSelectedShape(shape);
    setCurrentTool('add-block');
  };

  const handleShapeDragStart = (event: React.DragEvent, shape: string) => {
    event.dataTransfer.setData('text/plain', `shape:${shape}`);
    event.dataTransfer.effectAllowed = 'copy';
    setSelectedShape(shape);
  };

  const handleArrowDragStart = (event: React.DragEvent, arrowType: string) => {
    event.dataTransfer.setData('text/plain', `arrow:${arrowType}`);
    event.dataTransfer.effectAllowed = 'copy';
    setSelectedArrowType(arrowType);
  };

  const handleCanvasDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const data = event.dataTransfer.getData('text/plain');
    if (data) {
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const x = (event.clientX - rect.left - pan.x) / scale;
      const y = (event.clientY - rect.top - pan.y) / scale;
      
      if (data.startsWith('shape:')) {
        const shape = data.replace('shape:', '');
        setSelectedShape(shape);
        addBlock(x, y);
      } else if (data.startsWith('arrow:')) {
        const arrowType = data.replace('arrow:', '');
        setSelectedArrowType(arrowType);
        setCurrentTool('add-arrow');
        // For arrows, we create a default arrow with 100px length
        addArrowFromDrop(x, y, x + 100, y + 50);
      }
    }
  };

  const changeFillColor = (color: string) => {
    if (!selectedElement) return;
    const updated = elements.map(el => {
      if (el.id === selectedElement) {
        const currentStyle = el.style || '';
        const styleObj = parseStyle(currentStyle);
        styleObj.fillColor = color;
        return { ...el, style: stringifyStyle(styleObj) };
      }
      return el;
    });
    setElements(updated);
    updateXml(updated);
    saveToHistory();
  };

  const changeStrokeColor = (color: string) => {
    if (!selectedElement) return;
    const updated = elements.map(el => {
      if (el.id === selectedElement) {
        const currentStyle = el.style || '';
        const styleObj = parseStyle(currentStyle);
        styleObj.strokeColor = color;
        return { ...el, style: stringifyStyle(styleObj) };
      }
      return el;
    });
    setElements(updated);
    updateXml(updated);
    saveToHistory();
  };

  const parseStyle = (style: string): any => {
    const styleObj: any = {};
    if (!style) return styleObj;
    
    const pairs = style.split(';');
    pairs.forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) {
        styleObj[key] = value;
      }
    });
    return styleObj;
  };

  const stringifyStyle = (styleObj: any): string => {
    return Object.entries(styleObj)
      .filter(([key, value]) => key && value)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');
  };

  const addBlock = (x: number, y: number) => {
    const shapeStyle = getShapeStyle(selectedShape);
    const newBlock: DiagramElement = {
      id: `block_${Date.now()}_${Math.random()}`,
      type: 'vertex',
      x: x - 60, // Center on click
      y: y - 30,
      width: 120,
      height: 60,
      value: 'New Block',
      style: shapeStyle
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

  const renderShapeElement = (element: DiagramElement, isSelected: boolean) => {
    const styleObj = parseStyle(element.style);
    // If no shape is specified, try to infer from existing style or default to rectangle
    let shape = styleObj.shape || 'rectangle';
    
    // Handle legacy elements that might not have shape attribute
    if (!styleObj.shape) {
      // Check if it's a rounded rectangle (common in draw.io)
      if (element.style.includes('rounded=1') || element.style.includes('ellipse')) {
        shape = 'ellipse';
      } else if (element.style.includes('rhombus')) {
        shape = 'rhombus';
      } else if (element.style.includes('triangle')) {
        shape = 'triangle';
      }
    }
    
    const fillColor = styleObj.fillColor || '#f0f0f0';
    const strokeColor = styleObj.strokeColor || '#333';
    const strokeWidth = styleObj.strokeWidth || '2';

    const commonProps = {
      fill: fillColor,
      stroke: strokeColor,
      strokeWidth: strokeWidth,
      onClick: (e: React.MouseEvent) => handleElementClick(element.id, e),
      onContextMenu: (e: React.MouseEvent) => handleElementContextMenu(element.id, e),
      onMouseDown: (e: React.MouseEvent) => startDrag(element.id, e),
      style: { cursor: isSelected ? 'move' : 'pointer' }
    };

    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;

    switch (shape) {
      case 'ellipse':
        return (
          <ellipse
            cx={centerX}
            cy={centerY}
            rx={element.width / 2}
            ry={element.height / 2}
            {...commonProps}
          />
        );
      case 'rhombus':
        const diamondPoints = `${centerX},${element.y} ${element.x + element.width},${centerY} ${centerX},${element.y + element.height} ${element.x},${centerY}`;
        return <polygon points={diamondPoints} {...commonProps} />;
      case 'triangle':
        const trianglePoints = `${centerX},${element.y} ${element.x + element.width},${element.y + element.height} ${element.x},${element.y + element.height}`;
        return <polygon points={trianglePoints} {...commonProps} />;
      case 'hexagon':
        const hexSize = Math.min(element.width, element.height) / 2;
        const hexPoints = Array.from({ length: 6 }, (_, i) => {
          const angle = (i * Math.PI) / 3;
          const x = centerX + hexSize * Math.cos(angle);
          const y = centerY + hexSize * Math.sin(angle);
          return `${x},${y}`;
        }).join(' ');
        return <polygon points={hexPoints} {...commonProps} />;
      case 'star':
        const starSize = Math.min(element.width, element.height) / 2;
        const starPoints = Array.from({ length: 10 }, (_, i) => {
          const angle = (i * Math.PI) / 5;
          const radius = i % 2 === 0 ? starSize : starSize * 0.5;
          const x = centerX + radius * Math.cos(angle - Math.PI / 2);
          const y = centerY + radius * Math.sin(angle - Math.PI / 2);
          return `${x},${y}`;
        }).join(' ');
        return <polygon points={starPoints} {...commonProps} />;
      case 'cylinder':
        return (
          <g>
            <ellipse cx={centerX} cy={element.y + 10} rx={element.width / 2} ry="10" {...commonProps} />
            <rect x={element.x} y={element.y + 10} width={element.width} height={element.height - 20} {...commonProps} />
            <ellipse cx={centerX} cy={element.y + element.height - 10} rx={element.width / 2} ry="10" {...commonProps} />
          </g>
        );
      case 'cloud':
        return (
          <path
            d={`M${element.x + element.width * 0.2},${element.y + element.height * 0.7} 
                C${element.x},${element.y + element.height * 0.7} ${element.x},${element.y + element.height * 0.3} ${element.x + element.width * 0.2},${element.y + element.height * 0.3}
                C${element.x + element.width * 0.2},${element.y + element.height * 0.1} ${element.x + element.width * 0.4},${element.y} ${element.x + element.width * 0.6},${element.y + element.height * 0.1}
                C${element.x + element.width * 0.8},${element.y} ${element.x + element.width},${element.y + element.height * 0.2} ${element.x + element.width * 0.8},${element.y + element.height * 0.4}
                C${element.x + element.width},${element.y + element.height * 0.6} ${element.x + element.width * 0.8},${element.y + element.height} ${element.x + element.width * 0.6},${element.y + element.height * 0.8}
                C${element.x + element.width * 0.4},${element.y + element.height} ${element.x + element.width * 0.2},${element.y + element.height * 0.9} ${element.x + element.width * 0.2},${element.y + element.height * 0.7} Z`}
            {...commonProps}
          />
        );
      case 'actor':
        return (
          <g>
            <circle cx={centerX} cy={element.y + 15} r="12" {...commonProps} />
            <line x1={centerX} y1={element.y + 27} x2={centerX} y2={element.y + element.height - 20} {...commonProps} />
            <line x1={element.x + 10} y1={element.y + 40} x2={element.x + element.width - 10} y2={element.y + 40} {...commonProps} />
            <line x1={centerX} y1={element.y + element.height - 20} x2={element.x + 10} y2={element.y + element.height} {...commonProps} />
            <line x1={centerX} y1={element.y + element.height - 20} x2={element.x + element.width - 10} y2={element.y + element.height} {...commonProps} />
          </g>
        );
      case 'document':
        return (
          <path
            d={`M${element.x},${element.y} L${element.x + element.width},${element.y} L${element.x + element.width},${element.y + element.height - 10}
                C${element.x + element.width * 0.8},${element.y + element.height + 5} ${element.x + element.width * 0.2},${element.y + element.height + 5} ${element.x},${element.y + element.height - 10} Z`}
            {...commonProps}
          />
        );
      case 'parallelogram':
        const paraPoints = `${element.x + 20},${element.y} ${element.x + element.width},${element.y} ${element.x + element.width - 20},${element.y + element.height} ${element.x},${element.y + element.height}`;
        return <polygon points={paraPoints} {...commonProps} />;
      default: // rectangle
        return (
          <rect
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            rx="8"
            {...commonProps}
          />
        );
    }
  };

  const renderElement = (element: DiagramElement) => {
    const isSelected = selectedElement === element.id;

    if (element.type === 'edge') {
      // Render edge with proper points
      const points = element.points && element.points.length > 0 
        ? element.points 
        : [
            { x: element.x, y: element.y },
            { x: element.x + element.width, y: element.y + element.height }
          ];

      // Parse style for stroke, dashes, and markers
      const styleObj = parseStyle(element.style || '');
      const strokeColor = styleObj.strokeColor || '#333';
      const strokeWidth = Number(styleObj.strokeWidth || 2);
      const strokeDasharray = styleObj.strokeDashArray || undefined;
      const markerStart = styleObj.startArrow ? 'url(#arrowhead)' : undefined;
      const markerEnd = styleObj.endArrow ? 'url(#arrowhead)' : undefined;

      // Compute bounding box
      const minX = Math.min(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      const maxX = Math.max(...points.map(p => p.x));
      const maxY = Math.max(...points.map(p => p.y));
      const bboxWidth = maxX - minX;
      const bboxHeight = maxY - minY;
      const bboxCenterX = (minX + maxX) / 2;

      // Create path string for the arrow
      const pathData = points.length > 0 
        ? `M ${points[0].x} ${points[0].y} ` + 
          points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
        : `M ${element.x} ${element.y} L ${element.x + element.width} ${element.y + element.height}`;

      return (
        <g key={element.id}>
          {/* Arrow path */}
          <path
            d={pathData}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
            markerStart={markerStart}
            markerEnd={markerEnd}
            strokeDasharray={strokeDasharray}
            onClick={(e) => handleElementClick(element.id, e)}
            onContextMenu={(e) => handleElementContextMenu(element.id, e)}
            style={{ cursor: isSelected ? 'move' : 'pointer' }}
            onMouseDown={(e) => {
              if (e.button === 0) startDrag(element.id, e, { wholeEdge: true });
            }}
          />
          
          {/* Selection handles for arrows */}
          {isSelected && (
            <>
              {/* Selection highlight - thicker transparent line */}
              <path
                d={pathData}
                stroke="#007bff"
                strokeWidth={Math.max(8, strokeWidth + 6)}
                fill="none"
                opacity="0.15"
                onMouseDown={(e) => {
                  // Drag whole edge when grabbing the highlight
                  startDrag(element.id, e, { wholeEdge: true });
                }}
              />

              {/* Bounding box with resize handles */}
              <rect
                x={minX - 2}
                y={minY - 2}
                width={bboxWidth + 4}
                height={bboxHeight + 4}
                fill="none"
                stroke="#007bff"
                strokeWidth="2"
                strokeDasharray="5,5"
              />

              {/* 8 resize handles */}
              {/* Corners */}
              <circle cx={minX} cy={minY} r="6" fill="#007bff" onMouseDown={(e) => startResize('nw', e)} style={{ cursor: 'nw-resize' }} />
              <circle cx={maxX} cy={minY} r="6" fill="#007bff" onMouseDown={(e) => startResize('ne', e)} style={{ cursor: 'ne-resize' }} />
              <circle cx={maxX} cy={maxY} r="6" fill="#007bff" onMouseDown={(e) => startResize('se', e)} style={{ cursor: 'se-resize' }} />
              <circle cx={minX} cy={maxY} r="6" fill="#007bff" onMouseDown={(e) => startResize('sw', e)} style={{ cursor: 'sw-resize' }} />
              {/* Sides */}
              <circle cx={bboxCenterX} cy={minY} r="6" fill="#007bff" onMouseDown={(e) => startResize('n', e)} style={{ cursor: 'n-resize' }} />
              <circle cx={maxX} cy={(minY + maxY) / 2} r="6" fill="#007bff" onMouseDown={(e) => startResize('e', e)} style={{ cursor: 'e-resize' }} />
              <circle cx={bboxCenterX} cy={maxY} r="6" fill="#007bff" onMouseDown={(e) => startResize('s', e)} style={{ cursor: 's-resize' }} />
              <circle cx={minX} cy={(minY + maxY) / 2} r="6" fill="#007bff" onMouseDown={(e) => startResize('w', e)} style={{ cursor: 'w-resize' }} />

              {/* Control points for each point in the arrow */}
              {points.map((point, index) => (
                <circle
                  key={`point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="6"
                  fill="#007bff"
                  stroke="#fff"
                  strokeWidth="2"
                  style={{ cursor: 'move' }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    startDrag(element.id, e, { edgePointIndex: index });
                  }}
                />
              ))}
              
              {/* Midpoint handles for adding new points */}
              {points.length > 1 && points.slice(0, -1).map((point, index) => {
                const nextPoint = points[index + 1];
                const midX = (point.x + nextPoint.x) / 2;
                const midY = (point.y + nextPoint.y) / 2;
                return (
                  <circle
                    key={`mid-${index}`}
                    cx={midX}
                    cy={midY}
                    r="4"
                    fill="#28a745"
                    stroke="#fff"
                    strokeWidth="1"
                    style={{ cursor: 'copy' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      // Insert a new point between index and index+1 and start dragging it
                      const updated = elements.map(elm => {
                        if (elm.id !== element.id) return elm;
                        const base = (elm.points && elm.points.length > 0) ? [...elm.points] : [
                          { x: elm.x, y: elm.y },
                          { x: elm.x + elm.width, y: elm.y + elm.height }
                        ];
                        base.splice(index + 1, 0, { x: midX, y: midY });
                        return { ...elm, points: base };
                      });
                      setElements(updated);
                      // Begin dragging the inserted point
                      startDrag(element.id, e, { edgePointIndex: index + 1 });
                    }}
                  >
                    <title>Click to add point</title>
                  </circle>
                );
              })}

              {/* Rotation handle for edges */}
              <circle cx={bboxCenterX} cy={minY - 20} r="6" fill="#ff6b6b" onMouseDown={startRotate} style={{ cursor: 'crosshair' }} />
              <line x1={bboxCenterX} y1={minY} x2={bboxCenterX} y2={minY - 20} stroke="#ff6b6b" strokeWidth="2" />
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
          {renderShapeElement(element, isSelected)}
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
              {/* Resize handles (8 directions) */}
              <circle cx={element.x} cy={element.y} r="6" fill="#007bff" onMouseDown={(e) => startResize('nw', e)} style={{ cursor: 'nw-resize' }} />
              <circle cx={element.x + element.width / 2} cy={element.y} r="6" fill="#007bff" onMouseDown={(e) => startResize('n', e)} style={{ cursor: 'n-resize' }} />
              <circle cx={element.x + element.width} cy={element.y} r="6" fill="#007bff" onMouseDown={(e) => startResize('ne', e)} style={{ cursor: 'ne-resize' }} />
              <circle cx={element.x + element.width} cy={element.y + element.height / 2} r="6" fill="#007bff" onMouseDown={(e) => startResize('e', e)} style={{ cursor: 'e-resize' }} />
              <circle cx={element.x + element.width} cy={element.y + element.height} r="6" fill="#007bff" onMouseDown={(e) => startResize('se', e)} style={{ cursor: 'se-resize' }} />
              <circle cx={element.x + element.width / 2} cy={element.y + element.height} r="6" fill="#007bff" onMouseDown={(e) => startResize('s', e)} style={{ cursor: 's-resize' }} />
              <circle cx={element.x} cy={element.y + element.height} r="6" fill="#007bff" onMouseDown={(e) => startResize('sw', e)} style={{ cursor: 'sw-resize' }} />
              <circle cx={element.x} cy={element.y + element.height / 2} r="6" fill="#007bff" onMouseDown={(e) => startResize('w', e)} style={{ cursor: 'w-resize' }} />
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
              title="Add Block (B)"
            >
              <Square className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={currentTool === 'add-arrow' ? 'default' : 'outline'}
              onClick={() => setCurrentTool('add-arrow')}
              title="Add Arrow (A)"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={currentTool === 'drag' ? 'default' : 'outline'}
              onClick={() => setCurrentTool('drag')}
              title="Drag Tool (D)"
            >
              <Move className="w-4 h-4" />
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
          <Button size="sm" variant="outline" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">
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
          <span className="text-sm font-semibold px-3 py-1 min-w-16 text-center rounded bg-neutral-100 text-neutral-900 border">
            {Math.round(scale * 100)}%
          </span>
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
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 relative flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
          {/* Scroll Up Button */}
          {canScrollUp && (
            <div className="absolute top-0 right-0 z-10 bg-white border-l border-b border-gray-200 shadow-sm">
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 w-8 p-0 hover:bg-gray-100"
                onClick={scrollSidebarUp}
                title="Scroll Up"
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          {/* Scrollable Content */}
          <div 
            ref={sidebarRef}
            className="flex-1 overflow-y-auto sidebar-scroll"
          >
          {/* Tool Status */}
          {currentTool === 'add-block' && (
            <div className="p-3 bg-blue-50 border-b border-blue-200">
              <div className="text-xs text-blue-700 font-medium">
                {selectedShape.charAt(0).toUpperCase() + selectedShape.slice(1)} Tool Active
              </div>
              <div className="text-xs text-blue-600 mt-1">
                Click on canvas to add shape
              </div>
            </div>
          )}
          {currentTool === 'add-arrow' && (
            <div className="p-3 bg-green-50 border-b border-green-200">
              <div className="text-xs text-green-700 font-medium">
                Arrow Tool Active
              </div>
              <div className="text-xs text-green-600 mt-1">
                Click two shapes to connect
              </div>
            </div>
          )}
          
          {/* Scratchpad */}
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900">Scratchpad</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-500 hover:text-gray-900">
                  <span className="text-xs">+</span>
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-500 hover:text-gray-900">
                  <span className="text-xs">✎</span>
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-500 hover:text-gray-900">
                  <span className="text-xs">×</span>
                </Button>
              </div>
            </div>
            <div className="border-2 border-dashed border-gray-300 rounded p-4 text-center text-sm text-gray-500 bg-gray-50">
              Drag elements here
            </div>
          </div>

          {/* General Section */}
          <div className="border-b border-gray-200">
            <button
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-gray-900"
              onClick={() => toggleSidebarSection('general')}
            >
              <span className="text-sm font-medium">General</span>
              {sidebarCollapsed.general ? 
                <ChevronRight className="w-4 h-4" /> : 
                <ChevronDown className="w-4 h-4" />
              }
            </button>
            {!sidebarCollapsed.general && (
              <div className="p-3 grid grid-cols-4 gap-2">
                {/* Basic Shapes */}
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('rectangle')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'rectangle')}
                  title="Rectangle - Click to select tool or drag to canvas"
                >
                  <Square className="w-4 h-4" />
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('circle')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'circle')}
                  title="Circle - Click to select tool or drag to canvas"
                >
                  <Circle className="w-4 h-4" />
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('diamond')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'diamond')}
                  title="Diamond - Click to select tool or drag to canvas"
                >
                  <Diamond className="w-4 h-4" />
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('triangle')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'triangle')}
                  title="Triangle - Click to select tool or drag to canvas"
                >
                  <Triangle className="w-4 h-4" />
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('hexagon')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'hexagon')}
                  title="Hexagon - Click to select tool or drag to canvas"
                >
                  <Hexagon className="w-4 h-4" />
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('star')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'star')}
                  title="Star - Click to select tool or drag to canvas"
                >
                  <Star className="w-4 h-4" />
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('cylinder')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'cylinder')}
                  title="Cylinder - Click to select tool or drag to canvas"
                >
                  <div className="w-4 h-4 border border-current rounded-full"></div>
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('actor')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'actor')}
                  title="Actor - Click to select tool or drag to canvas"
                >
                  <div className="w-3 h-3 border border-current rounded-full mb-1"></div>
                </button>
              </div>
            )}
          </div>

          {/* Arrows Section */}
          <div className="border-b border-gray-200">
            <button
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-gray-900"
              onClick={() => toggleSidebarSection('arrows')}
            >
              <span className="text-sm font-medium">Arrows</span>
              {sidebarCollapsed.arrows ? 
                <ChevronRight className="w-4 h-4" /> : 
                <ChevronDown className="w-4 h-4" />
              }
            </button>
            {!sidebarCollapsed.arrows && (
              <div className="p-3 grid grid-cols-5 gap-2">
                {/* Arrow Types */}
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => { setSelectedArrowType('straight'); setCurrentTool('add-arrow'); }}
                  draggable
                  onDragStart={(e) => handleArrowDragStart(e, 'straight')}
                  title="Straight Arrow - Click to select tool or drag to canvas"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => { setSelectedArrowType('curved'); setCurrentTool('add-arrow'); }}
                  draggable
                  onDragStart={(e) => handleArrowDragStart(e, 'curved')}
                  title="Curved Arrow - Click to select tool or drag to canvas"
                >
                  <div className="w-4 h-4 border-t border-r border-current rounded-tr-lg"></div>
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => { setSelectedArrowType('dashed'); setCurrentTool('add-arrow'); }}
                  draggable
                  onDragStart={(e) => handleArrowDragStart(e, 'dashed')}
                  title="Dashed Arrow - Click to select tool or drag to canvas"
                >
                  <div className="w-4 h-0.5 border-t border-dashed border-current"></div>
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => { setSelectedArrowType('double'); setCurrentTool('add-arrow'); }}
                  draggable
                  onDragStart={(e) => handleArrowDragStart(e, 'double')}
                  title="Double Arrow - Click to select tool or drag to canvas"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="w-4 h-0.5 border-t border-current"></div>
                    <div className="w-4 h-0.5 border-t border-current"></div>
                  </div>
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => { setSelectedArrowType('bidirectional'); setCurrentTool('add-arrow'); }}
                  draggable
                  onDragStart={(e) => handleArrowDragStart(e, 'bidirectional')}
                  title="Bidirectional Arrow - Click to select tool or drag to canvas"
                >
                  <div className="w-4 h-0.5 border-t border-current relative">
                    <div className="absolute -left-1 -top-0.5 w-2 h-2 border-l border-t border-current transform rotate-45"></div>
                    <div className="absolute -right-1 -top-0.5 w-2 h-2 border-r border-t border-current transform -rotate-45"></div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Shapes Section */}
          <div className="border-b border-gray-200">
            <button
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-gray-900"
              onClick={() => toggleSidebarSection('shapes')}
            >
              <span className="text-sm font-medium">Shapes</span>
              {sidebarCollapsed.shapes ? 
                <ChevronRight className="w-4 h-4" /> : 
                <ChevronDown className="w-4 h-4" />
              }
            </button>
            {!sidebarCollapsed.shapes && (
              <div className="p-3 grid grid-cols-4 gap-2">
                {/* Advanced Shapes */}
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('cloud')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'cloud')}
                  title="Cloud - Click to select tool or drag to canvas"
                >
                  <div className="w-4 h-3 border border-current rounded-full relative">
                    <div className="absolute -top-1 left-1 w-2 h-2 border border-current rounded-full"></div>
                  </div>
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('document')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'document')}
                  title="Document - Click to select tool or drag to canvas"
                >
                  <div className="w-3 h-4 border border-current rounded-t">
                    <div className="w-full h-0.5 border-t border-current mt-1"></div>
                    <div className="w-full h-0.5 border-t border-current mt-0.5"></div>
                  </div>
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('database')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'database')}
                  title="Database - Click to select tool or drag to canvas"
                >
                  <div className="w-4 h-3 border border-current rounded-full"></div>
                </button>
                <button
                  className="aspect-square border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center text-gray-700 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => addShapeFromSidebar('process')}
                  draggable
                  onDragStart={(e) => handleShapeDragStart(e, 'process')}
                  title="Process - Click to select tool or drag to canvas"
                >
                  <div className="w-4 h-3 border border-current transform skew-x-12"></div>
                </button>
              </div>
            )}
          </div>

          {/* Styles Section */}
          <div className="border-b border-gray-200">
            <button
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-gray-900"
              onClick={() => toggleSidebarSection('styles')}
            >
              <span className="text-sm font-medium">Styles</span>
              {sidebarCollapsed.styles ? 
                <ChevronRight className="w-4 h-4" /> : 
                <ChevronDown className="w-4 h-4" />
              }
            </button>
            {!sidebarCollapsed.styles && (
              <div className="p-3 space-y-2">
                <div className="text-xs text-gray-600 mb-2">Fill Colors</div>
                <div className="grid grid-cols-6 gap-1">
                  <div 
                    className="w-6 h-6 bg-white border border-gray-400 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeFillColor('#ffffff')}
                    title="White"
                  ></div>
                  <div 
                    className="w-6 h-6 bg-red-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeFillColor('#ef4444')}
                    title="Red"
                  ></div>
                  <div 
                    className="w-6 h-6 bg-blue-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeFillColor('#3b82f6')}
                    title="Blue"
                  ></div>
                  <div 
                    className="w-6 h-6 bg-green-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeFillColor('#22c55e')}
                    title="Green"
                  ></div>
                  <div 
                    className="w-6 h-6 bg-yellow-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeFillColor('#eab308')}
                    title="Yellow"
                  ></div>
                  <div 
                    className="w-6 h-6 bg-purple-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeFillColor('#a855f7')}
                    title="Purple"
                  ></div>
                </div>
                <div className="text-xs text-gray-600 mb-2 mt-3">Stroke Colors</div>
                <div className="grid grid-cols-6 gap-1">
                  <div 
                    className="w-6 h-6 border-2 border-black rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeStrokeColor('#000000')}
                    title="Black"
                  ></div>
                  <div 
                    className="w-6 h-6 border-2 border-red-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeStrokeColor('#ef4444')}
                    title="Red"
                  ></div>
                  <div 
                    className="w-6 h-6 border-2 border-blue-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeStrokeColor('#3b82f6')}
                    title="Blue"
                  ></div>
                  <div 
                    className="w-6 h-6 border-2 border-green-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeStrokeColor('#22c55e')}
                    title="Green"
                  ></div>
                  <div 
                    className="w-6 h-6 border-2 border-yellow-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeStrokeColor('#eab308')}
                    title="Yellow"
                  ></div>
                  <div 
                    className="w-6 h-6 border-2 border-purple-500 rounded cursor-pointer hover:scale-110 transition-transform" 
                    onClick={() => changeStrokeColor('#a855f7')}
                    title="Purple"
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Section */}
          <div className="border-b border-gray-200">
            <button
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-gray-900"
              onClick={() => toggleSidebarSection('advanced')}
            >
              <span className="text-sm font-medium">Advanced</span>
              {sidebarCollapsed.advanced ? 
                <ChevronRight className="w-4 h-4" /> : 
                <ChevronDown className="w-4 h-4" />
              }
            </button>
            {!sidebarCollapsed.advanced && (
              <div className="p-3 space-y-2">
                <Button size="sm" variant="outline" className="w-full text-xs hover:bg-blue-50 hover:border-blue-300">
                  Import SVG
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs hover:bg-blue-50 hover:border-blue-300">
                  Export PNG
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs hover:bg-blue-50 hover:border-blue-300">
                  Layer Manager
                </Button>
              </div>
            )}
          </div>
          </div>
          
          {/* Scroll Down Button */}
          {canScrollDown && (
            <div className="absolute bottom-0 right-0 z-10 bg-white border-l border-t border-gray-200 shadow-sm">
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 w-8 p-0 hover:bg-gray-100"
                onClick={scrollSidebarDown}
                title="Scroll Down"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

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
            className={`${showImage && imageUrl ? "bg-transparent" : "bg-gray-50"} ${currentTool === 'add-block' ? 'drop-shadow-sm' : ''}`}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={isDragging ? handleMouseMove : isResizing ? handleResizeMove : isRotating ? handleRotateMove : isPanning ? handleMouseMove : undefined}
            onMouseUp={isDragging ? handleMouseUp : isResizing ? handleResizeUp : isRotating ? handleRotateUp : isPanning ? handleMouseUp : undefined}
            onWheel={handleWheel}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
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