import { useEffect, useRef, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { deflateRaw } from 'pako';

interface DiagramViewerProps {
  xml: string;
  className?: string;
}

// Convert Uint8Array to base64 string
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

export const DiagramViewer = ({ xml, className }: DiagramViewerProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewerUrl, setViewerUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!xml) return;

    try {
      // Process XML for draw.io viewer
      const data = encodeURIComponent(xml);
      const compressed = deflateRaw(data, { level: 9 });
      const base64 = uint8ToBase64(compressed);
      const hash = `R${base64}`;
      
      // Create viewer URL with specific settings for best visualization
      const timestamp = Date.now();
      const url = `https://viewer.diagrams.net/?highlight=0000ff&nav=1&layers=1&lightbox=1&edit=_blank&spin=1&t=${timestamp}#${hash}`;
      setViewerUrl(url);
      setError(null);
    } catch (error) {
      console.error('Failed to create diagram URL:', error);
      setError('Failed to render diagram');
    }
  }, [xml]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <Card className="p-4 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading updated diagram...</span>
          </Card>
        </div>
      )}
      {error ? (
        <div className="w-full h-full flex items-center justify-center">
          <Card className="p-4 text-destructive">
            {error}
          </Card>
        </div>
      ) : viewerUrl && (
        <iframe
          ref={iframeRef}
          src={viewerUrl}
          className="w-full h-full border-0 rounded-lg"
          onLoad={() => setIsLoading(false)}
          style={{ backgroundColor: 'white' }}
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      )}
    </div>
  );
};