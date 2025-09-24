import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUploader } from "./FileUploader";
import { ArchitectureViewer } from "./ArchitectureViewer";
import { ChatInterface } from "./ChatInterface";
import { XmlEditor } from "./XmlEditor";
import { Upload, MessageSquare, FileText, Image } from "lucide-react";

interface UploadedFiles {
  image?: File;
  xml?: File;
}

export const ArchitectureChatbot = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFiles>({});
  const [xmlContent, setXmlContent] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("upload");

  const handleFilesUploaded = (files: UploadedFiles) => {
    setUploadedFiles(files);
    if (files.xml) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setXmlContent(content);
        // Automatically switch to viewer tab when files are loaded
        setActiveTab("viewer");
      };
      reader.readAsText(files.xml);
    } else {
      // If no XML, switch to viewer
      setActiveTab("viewer");
    }
  };

  const hasFiles = !!(uploadedFiles.image || uploadedFiles.xml);

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-gradient-card p-4">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Architecture AI Chatbot
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload your architecture diagrams and let AI help you modify them
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 container mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-6 h-full overflow-hidden">
        {/* Left Panel - File Upload & Architecture Viewer */}
        <Card className="bg-gradient-card border-border/50 flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 bg-secondary/50">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="viewer" className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Viewer
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="flex-1 p-4 overflow-hidden">
              <FileUploader onFilesUploaded={handleFilesUploaded} />
            </TabsContent>

            <TabsContent value="viewer" className="flex-1 p-4 overflow-hidden">
              <ArchitectureViewer
                imageFile={uploadedFiles.image}
                xmlContent={xmlContent}
                onXmlUpdate={setXmlContent}
              />
            </TabsContent>
          </Tabs>
        </Card>

        {/* Right Panel - Chat & XML Editor */}
        <Card className="bg-gradient-card border-border/50 flex flex-col overflow-hidden">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 bg-secondary/50">
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="xml" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                XML Code
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="chat" className="flex-1 p-4">
              <ChatInterface 
                hasFiles={hasFiles}
                xmlContent={xmlContent}
                onXmlUpdate={setXmlContent}
              />
            </TabsContent>
            
            <TabsContent value="xml" className="flex-1 p-4 overflow-hidden">
              <XmlEditor
                content={xmlContent}
                onChange={setXmlContent}
              />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};
