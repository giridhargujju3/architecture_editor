import { useMemo, useState } from "react";
import ReactFlow, { 
  Node, 
  Edge,
  Background,
  Controls,
  MiniMap
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface XmlDiagramRendererProps {
  xml: string;
  className?: string;
}

interface XmlNode {
  id: string;
  value: string;
  style?: any;
  geometry?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(sub) as unknown as number[]);
  }
  return btoa(binary);
}

const parseXmlToNodes = (xmlString: string): { nodes: Node[]; edges: Edge[] } => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const cells = xmlDoc.getElementsByTagName("mxCell");
    
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    Array.from(cells).forEach((cell) => {
      const id = cell.getAttribute("id") || "";
      const value = cell.getAttribute("value") || "";
      const geometry = cell.getElementsByTagName("mxGeometry")[0];
      
      if (geometry) {
        const x = parseFloat(geometry.getAttribute("x") || "0");
        const y = parseFloat(geometry.getAttribute("y") || "0");
        const width = parseFloat(geometry.getAttribute("width") || "100");
        const height = parseFloat(geometry.getAttribute("height") || "40");
        
        if (cell.getAttribute("edge") === "1") {
          const source = cell.getAttribute("source") || "";
          const target = cell.getAttribute("target") || "";
          edges.push({
            id,
            source,
            target,
            type: 'smoothstep',
            animated: false
          });
        } else {
          nodes.push({
            id,
            position: { x, y },
            data: { label: value },
            style: {
              width,
              height,
              border: '1px solid #000',
              padding: 10,
              borderRadius: 5,
              backgroundColor: '#fff'
            }
          });
        }
      }
    });
    
    return { nodes, edges };
  } catch (error) {
    console.error("Failed to parse XML:", error);
    return { nodes: [], edges: [] };
  }
};

export const XmlDiagramRenderer = ({ xml, className }: XmlDiagramRendererProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const { nodes, edges } = useMemo(() => parseXmlToNodes(xml), [xml]);

  if (nodes.length === 0 && edges.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4 text-sm text-muted-foreground">
        Unable to parse XML diagram.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <Card className="p-4 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Rendering diagram...</span>
          </Card>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        className={className}
        onInit={() => setIsLoading(false)}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};