import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiagramViewer } from "./DiagramViewer";
import {
  Pen,
  Eraser,
  RotateCcw,
  Download,
  Type,
  Square,
  Circle,
  ArrowRight,
  Minus,
  ZoomIn,
  ZoomOut,
  Grid3X3 as GridIcon,
  MousePointer,
  Move,
  Link,
  Triangle,
  Diamond,
  Palette,
  Settings,
  Undo,
  Redo,
  Copy,
  Scissors,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart as AlignTop,
  AlignVerticalJustifyCenter as AlignMiddle,
  AlignVerticalJustifyEnd as AlignBottom,
  Layers,
  Save,
  FileDown,
} from "lucide-react";

interface CanvasEditorProps {
  xmlContent?: string;
  onXmlUpdate?: (xml: string) => void;
}

type Tool = "select" | "pen" | "eraser" | "line" | "rectangle" | "circle" | "triangle" | "diamond" | "arrow" | "text" | "connector";

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
}

export const CanvasEditor = ({ xmlContent, onXmlUpdate }: CanvasEditorProps) => {
  // Layered canvases: diagram viewer base -> draw (user) -> selection
  const containerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);

  // Tools
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#111111");
  const [fillColor, setFillColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<Point | null>(null);
  const [isAddingText, setIsAddingText] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<Point | null>(null);

  // Selection and diagram state
  const [selectedElements, setSelectedElements] = useState<Set<string>>(new Set());
  const [diagramElements, setDiagramElements] = useState<DiagramElement[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string>("");
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // Grid/Zoom/Pan
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const gridSize = 20; // px units at scale=1
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const lastPanRef = useRef<Point>({ x: 0, y: 0 });

  // History for undo/redo
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Clipboard for copy/paste
  const [clipboard, setClipboard] = useState<DiagramElement[]>([]);

  // Multi-selection with Ctrl
  const [ctrlPressed, setCtrlPressed] = useState(false);

  // Layer management
  const [showBaseLayer, setShowBaseLayer] = useState(true);
  const [showDrawLayer, setShowDrawLayer] = useState(true);
  const [showSelectionLayer, setShowSelectionLayer] = useState(true);

  // Clear selection when base layer is hidden (can't select invisible elements)
  const handleBaseLayerToggle = (checked: boolean) => {
    setShowBaseLayer(checked);
    if (!checked) {
      setSelectedElements(new Set());
    }
  };

  // Clear selection when selection layer is hidden
  const handleSelectionLayerToggle = (checked: boolean) => {
    setShowSelectionLayer(checked);
    if (!checked) {
      setSelectedElements(new Set());
    }
  };

  // Parse XML into diagram elements for interaction
  const parseXmlToElements = (xml: string): DiagramElement[] => {
    if (!xml) return [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "text/xml");
      const cells = Array.from(doc.getElementsByTagName("mxCell"));
      const elements: DiagramElement[] = [];

      for (const cell of cells) {
        const id = cell.getAttribute("id") || "";
        if (id === "0" || id === "1") continue; // Skip root cells

        const value = cell.getAttribute("value") || "";
        const style = cell.getAttribute("style") || "";
        const isEdge = cell.getAttribute("edge") === "1";
        const geometry = cell.getElementsByTagName("mxGeometry")[0];

        if (isEdge) {
          // Parse edge
          const source = cell.getAttribute("source") || "";
          const target = cell.getAttribute("target") || "";
          const points: Point[] = [];

          // Parse waypoints
          const array = cell.getElementsByTagName("Array")[0];
          if (array) {
            const pointsElements = array.getElementsByTagName("mxPoint");
            for (const point of Array.from(pointsElements)) {
              const x = parseFloat(point.getAttribute("x") || "0");
              const y = parseFloat(point.getAttribute("y") || "0");
              points.push({ x, y });
            }
          }

          // Get source and target points
          const sourcePoint = cell.querySelector('mxPoint[as="sourcePoint"]');
          const targetPoint = cell.querySelector('mxPoint[as="targetPoint"]');

          let x = 0, y = 0, width = 0, height = 0;
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

          elements.push({
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
          // Parse vertex
          const x = parseFloat(geometry.getAttribute("x") || "0");
          const y = parseFloat(geometry.getAttribute("y") || "0");
          const width = parseFloat(geometry.getAttribute("width") || "120");
          const height = parseFloat(geometry.getAttribute("height") || "60");

          elements.push({
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

      return elements;
    } catch (err) {
      console.error("Failed to parse XML:", err);
      return [];
    }
  };

  // Setup resize and initial canvas config
  useEffect(() => {
    const resize = () => {
      const container = containerRef.current;
      if (!container) return;
      const dpr = window.devicePixelRatio || 1;

      [drawCanvasRef, selectionCanvasRef].forEach((ref) => {
        const canvas = ref.current;
        if (!canvas) return;
        const { clientWidth, clientHeight } = container;
        canvas.width = Math.floor(clientWidth * dpr);
        canvas.height = Math.floor(clientHeight * dpr);
        canvas.style.width = `${clientWidth}px`;
        canvas.style.height = `${clientHeight}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      });

      // Redraw layers
      drawSelection();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep transforms in sync (applied via CSS to all layers)
  const transformStyle = useMemo(() => ({
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
    transformOrigin: "0 0",
  }), [pan, scale]);

  // Advanced editing functions
  const saveToHistory = useCallback(() => {
    const currentXml = elementsToXml(diagramElements);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(currentXml);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [diagramElements, history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevXml = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      const elements = parseXmlToElements(prevXml);
      setDiagramElements(elements);
      if (onXmlUpdate) onXmlUpdate(prevXml);
    }
  }, [history, historyIndex, onXmlUpdate]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextXml = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      const elements = parseXmlToElements(nextXml);
      setDiagramElements(elements);
      if (onXmlUpdate) onXmlUpdate(nextXml);
    }
  }, [history, historyIndex, onXmlUpdate]);

  const copySelectedElements = useCallback(() => {
    const selected = diagramElements.filter(el => selectedElements.has(el.id));
    setClipboard([...selected]);
  }, [diagramElements, selectedElements]);

  const cutSelectedElements = useCallback(() => {
    copySelectedElements();
    deleteSelectedElements();
  }, [copySelectedElements]);

  const pasteElements = useCallback(() => {
    if (clipboard.length === 0) return;

    const offset = 20;
    const newElements = clipboard.map(el => ({
      ...el,
      id: `pasted_${Date.now()}_${Math.random()}`,
      x: el.x + offset,
      y: el.y + offset,
    }));

    const updatedElements = [...diagramElements, ...newElements];
    setDiagramElements(updatedElements);
    setSelectedElements(new Set(newElements.map(el => el.id)));

    if (onXmlUpdate) {
      const newXml = elementsToXml(updatedElements);
      onXmlUpdate(newXml);
    }
    saveToHistory();
  }, [clipboard, diagramElements, onXmlUpdate, saveToHistory]);

  const deleteSelectedElements = useCallback(() => {
    if (selectedElements.size === 0) return;

    const updatedElements = diagramElements.filter(el => !selectedElements.has(el.id));
    setDiagramElements(updatedElements);
    setSelectedElements(new Set());

    if (onXmlUpdate) {
      const newXml = elementsToXml(updatedElements);
      onXmlUpdate(newXml);
    }
    saveToHistory();
  }, [selectedElements, diagramElements, onXmlUpdate, saveToHistory]);

  const selectAllElements = useCallback(() => {
    setSelectedElements(new Set(diagramElements.map(el => el.id)));
  }, [diagramElements]);

  const alignElements = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedElements.size < 2) return;

    const selected = diagramElements.filter(el => selectedElements.has(el.id));
    if (selected.length === 0) return;

    let targetValue = 0;

    switch (alignment) {
      case 'left':
        targetValue = Math.min(...selected.map(el => el.x));
        setDiagramElements(prev => prev.map(el =>
          selectedElements.has(el.id) ? { ...el, x: targetValue } : el
        ));
        break;
      case 'center':
        const centerX = selected.reduce((sum, el) => sum + (el.x + el.width / 2), 0) / selected.length;
        setDiagramElements(prev => prev.map(el =>
          selectedElements.has(el.id) ? { ...el, x: centerX - el.width / 2 } : el
        ));
        break;
      case 'right':
        targetValue = Math.max(...selected.map(el => el.x + el.width));
        setDiagramElements(prev => prev.map(el =>
          selectedElements.has(el.id) ? { ...el, x: targetValue - el.width } : el
        ));
        break;
      case 'top':
        targetValue = Math.min(...selected.map(el => el.y));
        setDiagramElements(prev => prev.map(el =>
          selectedElements.has(el.id) ? { ...el, y: targetValue } : el
        ));
        break;
      case 'middle':
        const centerY = selected.reduce((sum, el) => sum + (el.y + el.height / 2), 0) / selected.length;
        setDiagramElements(prev => prev.map(el =>
          selectedElements.has(el.id) ? { ...el, y: centerY - el.height / 2 } : el
        ));
        break;
      case 'bottom':
        targetValue = Math.max(...selected.map(el => el.y + el.height));
        setDiagramElements(prev => prev.map(el =>
          selectedElements.has(el.id) ? { ...el, y: targetValue - el.height } : el
        ));
        break;
    }

    if (onXmlUpdate) {
      const newXml = elementsToXml(diagramElements);
      onXmlUpdate(newXml);
    }
    saveToHistory();
  }, [selectedElements, diagramElements, onXmlUpdate, saveToHistory]);

  // Keyboard shortcuts and controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in text input
      if (isAddingText) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          setSpacePressed(true);
          break;
        case "ControlLeft":
        case "ControlRight":
          setCtrlPressed(true);
          break;
        case "Delete":
        case "Backspace":
          if (selectedElements.size > 0) {
            e.preventDefault();
            deleteSelectedElements();
          }
          break;
        case "KeyC":
          if (e.ctrlKey && selectedElements.size > 0) {
            e.preventDefault();
            copySelectedElements();
          }
          break;
        case "KeyV":
          if (e.ctrlKey && clipboard.length > 0) {
            e.preventDefault();
            pasteElements();
          }
          break;
        case "KeyX":
          if (e.ctrlKey && selectedElements.size > 0) {
            e.preventDefault();
            cutSelectedElements();
          }
          break;
        case "KeyZ":
          if (e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;
        case "KeyY":
          if (e.ctrlKey) {
            e.preventDefault();
            redo();
          }
          break;
        case "KeyA":
          if (e.ctrlKey) {
            e.preventDefault();
            selectAllElements();
          }
          break;
        case "Escape":
          setSelectedElements(new Set());
          setIsAddingText(false);
          setTextInput("");
          setTextPosition(null);
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "Space":
          setSpacePressed(false);
          break;
        case "ControlLeft":
        case "ControlRight":
          setCtrlPressed(false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedElements, clipboard, isAddingText]);

  // Helpers: coords with transform + snapping
  const toCanvasCoords = (clientX: number, clientY: number): Point => {
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / scale;
    const y = (clientY - rect.top - pan.y) / scale;
    if (!snapToGrid || tool === "pen" || tool === "eraser" || tool === "text") return { x, y };
    const sx = Math.round(x / gridSize) * gridSize;
    const sy = Math.round(y / gridSize) * gridSize;
    return { x: sx, y: sy };
  };

  // Utility: round rect path
  function roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Style helpers
  function getStyleValue(style: string, key: string, fallback: string) {
    const seg = style.split(";").find((s) => s.startsWith(`${key}=`));
    return seg ? seg.split("=")[1] : fallback;
  }
  function getStyleFlag(style: string, key: string) {
    return style.split(";").some((s) => s.startsWith(`${key}=1`));
  }

  useEffect(() => {
    const elements = parseXmlToElements(xmlContent || "");
    setDiagramElements(elements);
    drawSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xmlContent]);

  // SELECTION
  const drawSelection = () => {
    const canvas = selectionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear selection layer
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (selectedElements.size === 0) return;

    ctx.save();
    ctx.strokeStyle = "#007bff";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    for (const elementId of selectedElements) {
      const element = diagramElements.find(el => el.id === elementId);
      if (!element) continue;

      // Draw selection rectangle
      ctx.strokeRect(element.x, element.y, element.width, element.height);

      // Draw resize handles
      ctx.setLineDash([]);
      ctx.fillStyle = "#007bff";
      const handleSize = 6;

      // Corner handles
      const handles = [
        { x: element.x - handleSize/2, y: element.y - handleSize/2 }, // top-left
        { x: element.x + element.width - handleSize/2, y: element.y - handleSize/2 }, // top-right
        { x: element.x + element.width - handleSize/2, y: element.y + element.height - handleSize/2 }, // bottom-right
        { x: element.x - handleSize/2, y: element.y + element.height - handleSize/2 }, // bottom-left
      ];

      handles.forEach(handle => {
        ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
      });
    }

    ctx.restore();
  };

  useEffect(() => {
    drawSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElements, diagramElements]);


  // Helper: check if point is inside element
  const isPointInElement = (x: number, y: number, element: DiagramElement): boolean => {
    return x >= element.x && x <= element.x + element.width &&
           y >= element.y && y <= element.y + element.height;
  };

  // Helper: check if point is on resize handle
  const getResizeHandle = (x: number, y: number, element: DiagramElement): string => {
    const handleSize = 8;
    const handles = {
      'nw': { x: element.x - handleSize/2, y: element.y - handleSize/2 },
      'ne': { x: element.x + element.width - handleSize/2, y: element.y - handleSize/2 },
      'se': { x: element.x + element.width - handleSize/2, y: element.y + element.height - handleSize/2 },
      'sw': { x: element.x - handleSize/2, y: element.y + element.height - handleSize/2 },
    };

    for (const [handle, pos] of Object.entries(handles)) {
      if (x >= pos.x && x <= pos.x + handleSize && y >= pos.y && y <= pos.y + handleSize) {
        return handle;
      }
    }
    return '';
  };

  // DRAWING INTERACTIONS (user layer)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const isPanAction = spacePressed || e.button === 1; // middle mouse or space
    if (isPanAction) {
      setIsPanning(true);
      lastPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    const { x, y } = toCanvasCoords(e.clientX, e.clientY);

    if (tool === "select") {
      // Check for resize handles first
      for (const elementId of selectedElements) {
        const element = diagramElements.find(el => el.id === elementId);
        if (element) {
          const handle = getResizeHandle(x, y, element);
          if (handle) {
            setIsResizing(true);
            setResizeHandle(handle);
            setStartPos({ x, y });
            return;
          }
        }
      }

      // Check for element selection
      let clickedElement: DiagramElement | null = null;
      for (const element of diagramElements) {
        if (isPointInElement(x, y, element)) {
          clickedElement = element;
          break;
        }
      }

      if (clickedElement) {
        // Handle multi-selection with Ctrl/Cmd
        if (ctrlPressed || e.metaKey) {
          // Toggle selection
          const newSelection = new Set(selectedElements);
          if (newSelection.has(clickedElement.id)) {
            newSelection.delete(clickedElement.id);
          } else {
            newSelection.add(clickedElement.id);
          }
          setSelectedElements(newSelection);
        } else {
          // Single selection
          setSelectedElements(new Set([clickedElement.id]));
        }

        // Start dragging if we have a selection
        if (selectedElements.has(clickedElement.id) || (!ctrlPressed && !e.metaKey)) {
          setIsDragging(true);
          setDragOffset({ x: x - clickedElement.x, y: y - clickedElement.y });
        }
      } else {
        // Clear selection if clicking empty space (unless Ctrl is pressed)
        if (!ctrlPressed && !e.metaKey) {
          setSelectedElements(new Set());
        }
      }
      return;
    }

    if (tool === "connector") {
      // Find element under cursor to start connection
      const element = diagramElements.find(el => isPointInElement(x, y, el));
      if (element && element.type === 'vertex') {
        setConnectingFrom(element.id);
      }
      return;
    }

    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (tool === "text") {
      setTextPosition({ x, y });
      setIsAddingText(true);
      return;
    }

    setIsDrawing(true);
    setStartPos({ x, y });
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({ x: e.clientX - lastPanRef.current.x, y: e.clientY - pan.y });
      return;
    }

    const { x, y } = toCanvasCoords(e.clientX, e.clientY);

    if (isDragging && selectedElements.size > 0) {
      // Update element positions during drag
      const dx = x - dragOffset.x;
      const dy = y - dragOffset.y;

      setDiagramElements(prev => prev.map(element => {
        if (selectedElements.has(element.id)) {
          return { ...element, x: dx, y: dy };
        }
        return element;
      }));
      return;
    }

    if (isResizing && selectedElements.size === 1) {
      const elementId = Array.from(selectedElements)[0];
      const element = diagramElements.find(el => el.id === elementId);
      if (!element) return;

      let newX = element.x;
      let newY = element.y;
      let newWidth = element.width;
      let newHeight = element.height;

      switch (resizeHandle) {
        case 'nw':
          newX = x;
          newY = y;
          newWidth = element.x + element.width - x;
          newHeight = element.y + element.height - y;
          break;
        case 'ne':
          newY = y;
          newWidth = x - element.x;
          newHeight = element.y + element.height - y;
          break;
        case 'se':
          newWidth = x - element.x;
          newHeight = y - element.y;
          break;
        case 'sw':
          newX = x;
          newWidth = element.x + element.width - x;
          newHeight = y - element.y;
          break;
      }

      setDiagramElements(prev => prev.map(el =>
        el.id === elementId
          ? { ...el, x: newX, y: newY, width: Math.max(20, newWidth), height: Math.max(20, newHeight) }
          : el
      ));
      return;
    }

    if (!isDrawing || !startPos) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (tool === "pen" || tool === "eraser") {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  // Convert diagram elements back to XML
  const elementsToXml = (elements: DiagramElement[]): string => {
    if (!xmlContent) return xmlContent || "";

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlContent, "text/xml");
      const root = doc.getElementsByTagName("mxGraphModel")[0];

      // Update existing cells
      for (const element of elements) {
        const cell = doc.querySelector(`mxCell[id="${element.id}"]`);
        if (cell) {
          const geometry = cell.getElementsByTagName("mxGeometry")[0];
          if (geometry) {
            geometry.setAttribute("x", element.x.toString());
            geometry.setAttribute("y", element.y.toString());
            geometry.setAttribute("width", element.width.toString());
            geometry.setAttribute("height", element.height.toString());
          }
        }
      }

      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc);
    } catch (err) {
      console.error("Failed to convert elements to XML:", err);
      return xmlContent || "";
    }
  };

  const stopDrawing = (e?: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDragging) {
      setIsDragging(false);
      // Update XML with new positions
      if (onXmlUpdate) {
        const newXml = elementsToXml(diagramElements);
        onXmlUpdate(newXml);
      }
      return;
    }

    if (isResizing) {
      setIsResizing(false);
      setResizeHandle("");
      // Update XML with new sizes
      if (onXmlUpdate) {
        const newXml = elementsToXml(diagramElements);
        onXmlUpdate(newXml);
      }
      return;
    }

    if (connectingFrom && e) {
      const { x, y } = toCanvasCoords(e.clientX, e.clientY);
      const targetElement = diagramElements.find(el => isPointInElement(x, y, el) && el.type === 'vertex' && el.id !== connectingFrom);

      if (targetElement) {
        // Create new connection
        const newEdge: DiagramElement = {
          id: `connection_${Date.now()}`,
          type: 'edge',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          value: '',
          style: 'endArrow=classic;html=1;rounded=0;',
          source: connectingFrom,
          target: targetElement.id,
          points: []
        };

        const updatedElements = [...diagramElements, newEdge];
        setDiagramElements(updatedElements);

        // Update XML
        if (onXmlUpdate) {
          const newXml = elementsToXml(updatedElements);
          onXmlUpdate(newXml);
        }
      }

      setConnectingFrom(null);
      return;
    }

    if (!isDrawing || !startPos) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const p = e ? toCanvasCoords(e.clientX, e.clientY) : startPos;
    const currentPos = { x: p.x, y: p.y };

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;

    if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(currentPos.x, currentPos.y);
      ctx.stroke();
    } else if (tool === "rectangle") {
      const w = currentPos.x - startPos.x;
      const h = currentPos.y - startPos.y;
      ctx.strokeRect(startPos.x, startPos.y, w, h);
    } else if (tool === "circle") {
      const radius = Math.hypot(currentPos.x - startPos.x, currentPos.y - startPos.y);
      ctx.beginPath();
      ctx.arc(startPos.x, startPos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === "triangle") {
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(currentPos.x, startPos.y);
      ctx.lineTo((startPos.x + currentPos.x) / 2, currentPos.y);
      ctx.closePath();
      ctx.stroke();
    } else if (tool === "diamond") {
      const centerX = (startPos.x + currentPos.x) / 2;
      const centerY = (startPos.y + currentPos.y) / 2;
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - height / 2);
      ctx.lineTo(centerX + width / 2, centerY);
      ctx.lineTo(centerX, centerY + height / 2);
      ctx.lineTo(centerX - width / 2, centerY);
      ctx.closePath();
      ctx.stroke();
    } else if (tool === "arrow") {
      // line
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(currentPos.x, currentPos.y);
      ctx.stroke();
      // head
      const angle = Math.atan2(currentPos.y - startPos.y, currentPos.x - startPos.x);
      const len = 18;
      ctx.beginPath();
      ctx.moveTo(currentPos.x, currentPos.y);
      ctx.lineTo(currentPos.x - len * Math.cos(angle - Math.PI / 6), currentPos.y - len * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(currentPos.x, currentPos.y);
      ctx.lineTo(currentPos.x - len * Math.cos(angle + Math.PI / 6), currentPos.y - len * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }

    setIsDrawing(false);
    setStartPos(null);
    ctx.beginPath();
  };

  const addText = () => {
    if (!textPosition || !textInput.trim()) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
    ctx.font = `${brushSize * 4}px Arial`;
    ctx.textBaseline = "top";
    ctx.fillText(textInput, textPosition.x, textPosition.y);

    setTextInput("");
    setIsAddingText(false);
    setTextPosition(null);
  };

  const clearUserLayer = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const downloadCanvas = () => {
    const currentXml = elementsToXml(diagramElements);
    if (currentXml) {
      const blob = new Blob([currentXml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'canvas-diagram.xml';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return; // ctrl+wheel to zoom
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(3, Math.max(0.25, scale * factor));

    // Zoom to cursor: adjust pan to keep the cursor stable
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const nx = cx - ((cx - pan.x) * newScale) / scale;
    const ny = cy - ((cy - pan.y) * newScale) / scale;

    setScale(newScale);
    setPan({ x: nx, y: ny });
  };

  const zoomIn = () => setScale((s) => Math.min(3, s + 0.25));
  const zoomOut = () => setScale((s) => Math.max(0.25, s - 0.25));
  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 p-2 bg-secondary/30 rounded flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant={tool === "select" ? "secondary" : "outline"} size="sm" onClick={() => setTool("select")}>
            <MousePointer className="w-4 h-4" /> Select
          </Button>
          <Button variant={tool === "connector" ? "secondary" : "outline"} size="sm" onClick={() => setTool("connector")}>
            <Link className="w-4 h-4" /> Connector
          </Button>
          <Button variant={tool === "pen" ? "secondary" : "outline"} size="sm" onClick={() => setTool("pen")}>
            <Pen className="w-4 h-4" /> Pen
          </Button>
          <Button variant={tool === "eraser" ? "secondary" : "outline"} size="sm" onClick={() => setTool("eraser")}>
            <Eraser className="w-4 h-4" /> Eraser
          </Button>
          <Button variant={tool === "line" ? "secondary" : "outline"} size="sm" onClick={() => setTool("line")}>
            <Minus className="w-4 h-4" /> Line
          </Button>
          <Button variant={tool === "rectangle" ? "secondary" : "outline"} size="sm" onClick={() => setTool("rectangle")}>
            <Square className="w-4 h-4" /> Rectangle
          </Button>
          <Button variant={tool === "circle" ? "secondary" : "outline"} size="sm" onClick={() => setTool("circle")}>
            <Circle className="w-4 h-4" /> Circle
          </Button>
          <Button variant={tool === "triangle" ? "secondary" : "outline"} size="sm" onClick={() => setTool("triangle")}>
            <Triangle className="w-4 h-4" /> Triangle
          </Button>
          <Button variant={tool === "diamond" ? "secondary" : "outline"} size="sm" onClick={() => setTool("diamond")}>
            <Diamond className="w-4 h-4" /> Diamond
          </Button>
          <Button variant={tool === "arrow" ? "secondary" : "outline"} size="sm" onClick={() => setTool("arrow")}>
            <ArrowRight className="w-4 h-4" /> Arrow
          </Button>
          <Button variant={tool === "text" ? "secondary" : "outline"} size="sm" onClick={() => setTool("text")}>
            <Type className="w-4 h-4" /> Text
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm">Stroke:</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded border cursor-pointer"
          />
          <label className="text-sm">Fill:</label>
          <input
            type="color"
            value={fillColor}
            onChange={(e) => setFillColor(e.target.value)}
            className="w-8 h-8 rounded border cursor-pointer"
          />
          <input
            type="range"
            min={1}
            max={20}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground w-8">{brushSize}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Edit Operations */}
          <Button variant="outline" size="sm" onClick={undo} disabled={historyIndex <= 0}>
            <Undo className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1}>
            <Redo className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={copySelectedElements} disabled={selectedElements.size === 0}>
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={cutSelectedElements} disabled={selectedElements.size === 0}>
            <Scissors className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={deleteSelectedElements} disabled={selectedElements.size === 0}>
            <Trash2 className="w-4 h-4" />
          </Button>

          {/* Alignment Tools */}
          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button variant="outline" size="sm" onClick={() => alignElements('left')} disabled={selectedElements.size < 2} title="Align Left">
              <AlignLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => alignElements('center')} disabled={selectedElements.size < 2} title="Align Center">
              <AlignCenter className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => alignElements('right')} disabled={selectedElements.size < 2} title="Align Right">
              <AlignRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => alignElements('top')} disabled={selectedElements.size < 2} title="Align Top">
              <AlignTop className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => alignElements('middle')} disabled={selectedElements.size < 2} title="Align Middle">
              <AlignMiddle className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => alignElements('bottom')} disabled={selectedElements.size < 2} title="Align Bottom">
              <AlignBottom className="w-4 h-4" />
            </Button>
          </div>

          {/* View Controls */}
          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button variant={showGrid ? "secondary" : "outline"} size="sm" onClick={() => setShowGrid((s) => !s)} title="Toggle Grid">
              <GridIcon className="w-4 h-4" />
            </Button>
            <Button variant={snapToGrid ? "secondary" : "outline"} size="sm" onClick={() => setSnapToGrid((s) => !s)} title="Snap to Grid">
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={zoomIn} title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={zoomOut} title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={resetView} title="Reset View">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          {/* Layers */}
          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">Layers:</span>
              <label className="flex items-center gap-1 cursor-pointer hover:bg-secondary/50 px-1 py-0.5 rounded" title="Toggle base diagram visibility">
                <input
                  type="checkbox"
                  checked={showBaseLayer}
                  onChange={(e) => handleBaseLayerToggle(e.target.checked)}
                  className="w-3 h-3"
                />
                Base
              </label>
              <label className="flex items-center gap-1 cursor-pointer hover:bg-secondary/50 px-1 py-0.5 rounded" title="Toggle drawing layer visibility">
                <input
                  type="checkbox"
                  checked={showDrawLayer}
                  onChange={(e) => setShowDrawLayer(e.target.checked)}
                  className="w-3 h-3"
                />
                Draw
              </label>
              <label className="flex items-center gap-1 cursor-pointer hover:bg-secondary/50 px-1 py-0.5 rounded" title="Toggle selection handles visibility">
                <input
                  type="checkbox"
                  checked={showSelectionLayer}
                  onChange={(e) => handleSelectionLayerToggle(e.target.checked)}
                  className="w-3 h-3"
                />
                Select
              </label>
            </div>
          </div>

          {/* Export */}
          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button variant="outline" size="sm" onClick={clearUserLayer} title="Clear Drawings">
              <Eraser className="w-4 h-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hover:bg-accent" title="Export Options - Click to open menu">
                  <FileDown className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => {
                  console.log('Exporting XML...');
                  downloadCanvas();
                }} className="cursor-pointer">
                  <Download className="w-4 h-4 mr-2" />
                  Export XML
                  <span className="ml-auto text-xs text-muted-foreground">.xml</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const currentXml = elementsToXml(diagramElements);
                  if (currentXml) {
                    const jsonData = {
                      xml: currentXml,
                      elements: diagramElements,
                      metadata: {
                        exportedAt: new Date().toISOString(),
                        tool: 'CanvasEditor',
                        version: '1.0'
                      }
                    };
                    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'diagram.json';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  }
                }} className="cursor-pointer">
                  <Save className="w-4 h-4 mr-2" />
                  Export JSON
                  <span className="ml-auto text-xs text-muted-foreground">.json</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  // Export as PNG by rendering the diagram
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  if (!ctx) return;

                  // Set canvas size based on diagram bounds
                  const bounds = diagramElements.reduce((acc, el) => ({
                    minX: Math.min(acc.minX, el.x),
                    minY: Math.min(acc.minY, el.y),
                    maxX: Math.max(acc.maxX, el.x + el.width),
                    maxY: Math.max(acc.maxY, el.y + el.height)
                  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

                  const padding = 20;
                  canvas.width = Math.max(800, bounds.maxX - bounds.minX + padding * 2);
                  canvas.height = Math.max(600, bounds.maxY - bounds.minY + padding * 2);

                  // Fill background
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);

                  // Render elements
                  diagramElements.forEach(element => {
                    if (element.type === 'vertex') {
                      // Draw rectangle with rounded corners
                      const x = element.x - bounds.minX + padding;
                      const y = element.y - bounds.minY + padding;
                      const w = element.width;
                      const h = element.height;

                      ctx.fillStyle = '#f0f0f0';
                      ctx.strokeStyle = '#333333';
                      ctx.lineWidth = 2;

                      // Rounded rectangle
                      ctx.beginPath();
                      const radius = 8;
                      ctx.moveTo(x + radius, y);
                      ctx.lineTo(x + w - radius, y);
                      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
                      ctx.lineTo(x + w, y + h - radius);
                      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
                      ctx.lineTo(x + radius, y + h);
                      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
                      ctx.lineTo(x, y + radius);
                      ctx.quadraticCurveTo(x, y, x + radius, y);
                      ctx.closePath();

                      ctx.fill();
                      ctx.stroke();

                      // Draw text
                      if (element.value) {
                        ctx.fillStyle = '#333333';
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(element.value, x + w/2, y + h/2);
                      }
                    }
                  });

                  const link = document.createElement('a');
                  link.download = 'diagram.png';
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                }} className="cursor-pointer">
                  <FileDown className="w-4 h-4 mr-2" />
                  Export PNG
                  <span className="ml-auto text-xs text-muted-foreground">.png</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Text input overlay */}
      {isAddingText && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-secondary/30 rounded">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter text..."
            className="flex-1 px-3 py-1 border rounded"
            onKeyDown={(e) => {
              if (e.key === "Enter") addText();
              if (e.key === "Escape") {
                setIsAddingText(false);
                setTextPosition(null);
                setTextInput("");
              }
            }}
            autoFocus
          />
          <Button size="sm" onClick={addText}>Add</Button>
          <Button size="sm" variant="outline" onClick={() => { setIsAddingText(false); setTextInput(""); setTextPosition(null); }}>
            Cancel
          </Button>
          <div className="text-xs text-muted-foreground ml-2">Tip: Hold Space and drag to pan. Ctrl + wheel to zoom.</div>
        </div>
      )}

      {/* Canvas stack */}
      <Card className="flex-1 overflow-hidden bg-white relative">
        {/* Base diagram layer using DiagramViewer */}
        {xmlContent && showBaseLayer && (
          <div className="absolute inset-0">
            <DiagramViewer
              xml={xmlContent}
              className="w-full h-full"
            />
          </div>
        )}

        {/* Interactive overlay for editing */}
        <div
          ref={containerRef}
          className="absolute inset-0 pointer-events-none"
          onWheel={handleWheel}
          style={{
            cursor: isPanning ? "grabbing" :
                   spacePressed ? "grab" :
                   isDragging ? "grabbing" :
                   tool === "select" ? "default" :
                   "crosshair"
          }}
        >
          {/* Draw/User layer - only for user drawings */}
          {showDrawLayer && (
            <canvas
              ref={drawCanvasRef}
              className="absolute inset-0 pointer-events-auto"
              style={transformStyle}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
          )}
          {/* Selection layer */}
          {showSelectionLayer && (
            <canvas ref={selectionCanvasRef} className="absolute inset-0 pointer-events-none" style={transformStyle} />
          )}
        </div>
      </Card>

      {/* Status Bar */}
      <div className="flex items-center justify-between mt-2 px-3 py-2 bg-secondary/30 rounded-lg text-xs border">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tool:</span>
            <span className="font-medium capitalize bg-primary/10 px-2 py-0.5 rounded">{tool}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Zoom:</span>
            <span className="font-medium bg-accent/50 px-2 py-0.5 rounded">{Math.round(scale * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Selected:</span>
            <span className="font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
              {selectedElements.size} element{selectedElements.size !== 1 ? 's' : ''}
            </span>
          </div>
          {selectedElements.size > 0 && (
            <div className="flex items-center gap-2 max-w-xs">
              <span className="text-muted-foreground">Items:</span>
              <span className="font-medium text-ellipsis overflow-hidden" title={
                Array.from(selectedElements).map(id => {
                  const el = diagramElements.find(e => e.id === id);
                  return el?.value || id;
                }).join(', ')
              }>
                {Array.from(selectedElements).slice(0, 2).map(id => {
                  const el = diagramElements.find(e => e.id === id);
                  return el?.value || id.substring(0, 8);
                }).join(', ')}
                {selectedElements.size > 2 && ` +${selectedElements.size - 2} more`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs ${showGrid ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
              Grid: {showGrid ? 'On' : 'Off'}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs ${snapToGrid ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
              Snap: {snapToGrid ? 'On' : 'Off'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground border-l pl-4">
            <span className="font-medium">Shortcuts:</span> Ctrl+Click (multi), Space+Drag (pan), Ctrl+Wheel (zoom)
          </div>
        </div>
      </div>
    </div>
  );
};
