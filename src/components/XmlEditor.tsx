import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, RotateCcw, FileText } from "lucide-react";
import { toast } from "sonner";

interface XmlEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export const XmlEditor = ({ content, onChange }: XmlEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("XML copied to clipboard!");
    } catch (error) {
      toast.error("Failed to copy XML");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'architecture.xml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("XML file downloaded!");
  };

  const handleSave = () => {
    onChange(editContent);
    setIsEditing(false);
    toast.success("XML updated!");
  };

  const handleReset = () => {
    setEditContent(content);
    setIsEditing(false);
  };

  const formatXml = (xml: string): string => {
    if (!xml) return '';
    
    // Simple XML formatting
    let formatted = xml.replace(/></g, '>\n<');
    const lines = formatted.split('\n');
    let indent = 0;
    const indentSize = 2;
    
    return lines
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        
        if (trimmed.startsWith('</')) {
          indent = Math.max(0, indent - indentSize);
        }
        
        const result = ' '.repeat(indent) + trimmed;
        
        if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>')) {
          indent += indentSize;
        }
        
        return result;
      })
      .join('\n');
  };

  const getXmlStats = () => {
    if (!content) return { lines: 0, chars: 0, elements: 0 };
    
    const lines = content.split('\n').length;
    const chars = content.length;
    const elements = (content.match(/<[^/][^>]*>/g) || []).length;
    
    return { lines, chars, elements };
  };

  const stats = getXmlStats();
  const formattedXml = formatXml(isEditing ? editContent : content);

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="flex items-center justify-between mb-4 p-3 bg-secondary/20 rounded">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <span className="font-medium">XML Code</span>
          {content && (
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs">
                {stats.lines} lines
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {stats.elements} elements
              </Badge>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={handleSave} className="bg-gradient-primary">
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={!content}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} disabled={!content}>
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* XML Content */}
      <Card className="flex-1 overflow-hidden bg-gradient-secondary">
        {content ? (
          <ScrollArea className="h-full">
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full min-h-[400px] bg-transparent border-none outline-none p-4 font-mono text-sm resize-none"
                spellCheck={false}
              />
            ) : (
              <div className="p-4">
                <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">
                  {formattedXml}
                </pre>
              </div>
            )}
          </ScrollArea>
        ) : (
          <div className="flex items-center justify-center h-full text-center p-8">
            <div>
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No XML Content</h3>
              <p className="text-muted-foreground">
                Upload an XML or DrawIO file to view and edit the code
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Edit Toggle */}
      {content && !isEditing && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => {
            setEditContent(content);
            setIsEditing(true);
          }}
        >
          Edit XML Code
        </Button>
      )}
    </div>
  );
};