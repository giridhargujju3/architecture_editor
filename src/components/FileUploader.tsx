import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileImage, FileCode, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface UploadedFiles {
  image?: File;
  xml?: File;
}

interface FileUploaderProps {
  onFilesUploaded: (files: UploadedFiles) => void;
}

export const FileUploader = ({ onFilesUploaded }: FileUploaderProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFiles>({});

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFiles = { ...uploadedFiles };
    
    acceptedFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        newFiles.image = file;
        toast.success(`Image uploaded: ${file.name}`);
      } else if (file.name.endsWith('.xml') || file.name.endsWith('.drawio')) {
        newFiles.xml = file;
        toast.success(`XML file uploaded: ${file.name}`);
      } else {
        toast.error(`Unsupported file type: ${file.name}`);
      }
    });

    setUploadedFiles(newFiles);
    onFilesUploaded(newFiles);
  }, [uploadedFiles, onFilesUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg'],
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
      'application/octet-stream': ['.drawio']
    },
    multiple: true
  });

  const clearFiles = () => {
    setUploadedFiles({});
    onFilesUploaded({});
    toast.info("Files cleared");
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Drop Zone */}
      <Card
        {...getRootProps()}
        className={`flex-1 border-2 border-dashed cursor-pointer transition-all duration-300 
          ${isDragActive 
            ? 'border-primary bg-primary/5 shadow-glow-primary' 
            : 'border-border hover:border-primary/50 hover:bg-accent/5'
          }
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <Upload className={`w-16 h-16 mb-4 transition-colors duration-300 ${
            isDragActive ? 'text-primary' : 'text-muted-foreground'
          }`} />
          
          {isDragActive ? (
            <p className="text-lg font-medium text-primary">Drop files here...</p>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-2">Upload Architecture Files</h3>
              <p className="text-muted-foreground mb-4">
                Drag & drop your files here, or click to browse
              </p>
              <div className="flex flex-wrap gap-2 justify-center text-sm text-muted-foreground">
                <span className="bg-secondary px-2 py-1 rounded">PNG, JPG, SVG</span>
                <span className="bg-secondary px-2 py-1 rounded">XML, DrawIO</span>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Uploaded Files Display */}
      {(uploadedFiles.image || uploadedFiles.xml) && (
        <Card className="p-4 bg-secondary/20">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">Uploaded Files</h4>
            <Button variant="outline" size="sm" onClick={clearFiles}>
              Clear All
            </Button>
          </div>
          
          <div className="space-y-2">
            {uploadedFiles.image && (
              <div className="flex items-center gap-3 p-2 bg-background/50 rounded">
                <FileImage className="w-5 h-5 text-accent" />
                <span className="flex-1 text-sm truncate">{uploadedFiles.image.name}</span>
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
            )}
            
            {uploadedFiles.xml && (
              <div className="flex items-center gap-3 p-2 bg-background/50 rounded">
                <FileCode className="w-5 h-5 text-primary" />
                <span className="flex-1 text-sm truncate">{uploadedFiles.xml.name}</span>
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};