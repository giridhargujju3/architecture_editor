import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Zap } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  hasFiles: boolean;
  xmlContent: string;
  onXmlUpdate: (content: string) => void;
}

export const ChatInterface = ({ hasFiles, xmlContent, onXmlUpdate }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: 'Hello! I\'m your Architecture AI assistant. Upload your architecture diagrams and XML files, then tell me what changes you\'d like to make. I can help you modify components, add new elements, or restructure your architecture.',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    if (!hasFiles) {
      toast.error("Please upload architecture files first");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Process AI request and make actual changes
    setTimeout(() => {
      let actualChanges: string[] = [];
      let modifiedXml = xmlContent;

      // Make actual XML changes if content exists
      if (xmlContent) {
        // Ensure XML is properly formatted for draw.io
        if (!xmlContent.includes('mxGraphModel')) {
          toast.error("The uploaded file doesn't seem to be a valid draw.io diagram");
          setIsLoading(false);
          return;
        }
        const result = makeActualXmlChanges(inputValue, xmlContent);
        modifiedXml = result.modifiedXml;
        actualChanges = result.changes;

        console.log('AI Processing:', {
          input: inputValue,
          changes: actualChanges,
          xmlLength: xmlContent.length,
          modifiedLength: modifiedXml.length
        });

        // Update XML content if changes were made
        if (actualChanges.length > 0) {
          onXmlUpdate(modifiedXml);
          toast.success(`✅ XML Updated! Made ${actualChanges.length} change(s). Check the XML Code tab to see changes.`);
        } else {
          console.log('No changes made. Input may not match patterns.');
        }
      }

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: generateAIResponse(inputValue, xmlContent, actualChanges),
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1500);
  };

  const makeActualXmlChanges = (userInput: string, xml: string): { modifiedXml: string; changes: string[] } => {
    const lowerInput = userInput.toLowerCase();
    let modifiedXml = xml;
    const changes: string[] = [];

    // Dynamic AI-powered XML modification system
    try {
      // 1. CONNECTION/ARROW MANAGEMENT - Check this FIRST before component operations
      if (lowerInput.includes('connection') || lowerInput.includes('arrow') || lowerInput.includes('line') || lowerInput.includes('wire') || lowerInput.includes('link') || lowerInput.includes('connect')) {
        // Add connection between components
        if (lowerInput.includes('add') || lowerInput.includes('create')) {
          const connectMatch = userInput.match(/(?:add|create)\s+(?:a\s+|an\s+)?(?:connection|arrow|line|wire|link)\s+between\s+([A-Za-z][A-Za-z0-9\s]*?)\s+and\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s|$)/i);
          if (connectMatch) {
            const result = addConnection(modifiedXml, connectMatch[1].trim(), connectMatch[2].trim());
            if (result.success) {
              modifiedXml = result.xml;
              changes.push(result.message);
              return { modifiedXml, changes };
            }
          }
        }

        // Remove connection between components
        if (lowerInput.includes('remove') || lowerInput.includes('delete') || lowerInput.includes('disconnect')) {
          const removeMatch = userInput.match(/(?:remove|delete|disconnect)\s+(?:the\s+)?(?:arrow|connection|line|wire|link)?\s*(?:between\s+)?([A-Za-z][A-Za-z0-9\s]*?)\s+and\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s|$)/i);
          if (removeMatch) {
            const result = removeConnections(modifiedXml, removeMatch[1].trim(), removeMatch[2].trim());
            if (result.success) {
              modifiedXml = result.xml;
              changes.push(result.message);
              return { modifiedXml, changes };
            }
          }

          // Remove all connections
          if (lowerInput.includes('all')) {
            const result = removeConnections(modifiedXml);
            if (result.success) {
              modifiedXml = result.xml;
              changes.push(result.message);
              return { modifiedXml, changes };
            }
          }
        }

        // If we get here, we couldn't process the connection request
        return { modifiedXml, changes };
      }

      // 2. COMPONENT REMOVAL - Remove blocks/components (only if not a connection operation)
      const removePatterns = [
        /remove\s+(?:the\s+)?(\w+)(?:\s+block|\s+component)?/i,
        /delete\s+(?:the\s+)?(\w+)(?:\s+block|\s+component)?/i,
        /take\s+out\s+(?:the\s+)?(\w+)/i,
        /eliminate\s+(?:the\s+)?(\w+)/i
      ];

      for (const pattern of removePatterns) {
        const match = userInput.match(pattern);
        if (match) {
          const componentToRemove = match[1];
          const result = removeComponent(modifiedXml, componentToRemove);
          if (result.success) {
            modifiedXml = result.xml;
            changes.push(`Removed ${componentToRemove.toUpperCase()} component and its connections`);
            return { modifiedXml, changes };
          }
        }
      }

      // 3. COMPONENT RENAMING/REPLACEMENT - Dynamic pattern matching
      const changePatterns = [
        /(?:change|rename|replace|convert|switch|update|make|turn)\s+(?:the\s+)?(\w+)(?:\s+(?:to|as|into|with|by))\s+(?:a\s+|an\s+)?(\w+)/i,
        /(\w+)\s+(?:to|as|into|→|->)\s+(\w+)/i,
        /replace\s+(\w+)\s+with\s+(\w+)/i
      ];

      for (const pattern of changePatterns) {
        const match = userInput.match(pattern);
        if (match) {
          const [, fromComponent, toComponent] = match;
          const result = replaceComponent(modifiedXml, fromComponent, toComponent);
          if (result.success) {
            modifiedXml = result.xml;
            changes.push(`Changed ${result.count} instance(s) of "${fromComponent.toUpperCase()}" to "${toComponent.toUpperCase()}"`);
            return { modifiedXml, changes };
          }
        }
      }


      // 4. COMPONENT ADDITION (with spatial positioning) - Enhanced parsing
      if (lowerInput.includes('add') || lowerInput.includes('insert') || lowerInput.includes('create') || lowerInput.includes('place')) {
        // Extract component name - more flexible approach
        let componentToAdd = '';

        // First, try to extract from "add X" or "add a X" patterns - more specific
        const addMatch = userInput.match(/(?:add|insert|create|place)\s+(?:a\s+|an\s+|new\s+)?([A-Z]{2,}|\w+)(?:\s+(?:component|block|called|between|beside|next|above|below|left|right))?/i);
        if (addMatch) {
          componentToAdd = addMatch[1].trim();
        }

        // If not found, look for uppercase words
        if (!componentToAdd) {
          const words = userInput.split(/\s+/);
          for (const word of words) {
            if (word.length >= 2 && word === word.toUpperCase() &&
                !['ADD', 'INSERT', 'CREATE', 'PLACE', 'CALLED', 'NEW', 'BLOCK', 'COMPONENT', 'BETWEEN', 'BESIDE', 'NEXT', 'ABOVE', 'BELOW', 'LEFT', 'RIGHT'].includes(word)) {
              componentToAdd = word;
              break;
            }
          }
        }

        if (componentToAdd) {
          // Check for "between X and Y" or "middle X and Y" - this takes priority
          const positionMatch = userInput.match(/(?:between|middle)\s+([A-Za-z][A-Za-z0-9\s]*?)\s+and\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s|$)/i);
          console.log('Position match for input:', userInput, 'result:', positionMatch);
          if (positionMatch) {
            console.log('Calling addComponentWithPosition with:', componentToAdd, positionMatch[1].trim(), positionMatch[2].trim());
            const result = addComponentWithPosition(modifiedXml, componentToAdd, positionMatch[1].trim(), positionMatch[2].trim(), userInput);
            console.log('addComponentWithPosition result:', result);
            if (result.success) {
              modifiedXml = result.xml;
              changes.push(result.message);
              return { modifiedXml, changes };
            }
          }

          // Check for positioning relative to single component
          const positionWords = ['beside', 'next to', 'near', 'above', 'below', 'left of', 'right of'];
          for (const pos of positionWords) {
            if (lowerInput.includes(pos)) {
              // Extract component name after the position word
              const posIndex = lowerInput.indexOf(pos);
              const afterPos = userInput.substring(posIndex + pos.length).trim();
              const refComponentMatch = afterPos.match(/^([A-Za-z][A-Za-z0-9\s]*?)(?:\s|$)/);
              if (refComponentMatch) {
                const result = addComponentWithPosition(modifiedXml, componentToAdd, refComponentMatch[1].trim(), undefined, userInput);
                if (result.success) {
                  modifiedXml = result.xml;
                  changes.push(result.message);
                  return { modifiedXml, changes };
                }
              }
              break;
            }
          }

          // Default add without positioning
          const result = addComponent(modifiedXml, componentToAdd);
          if (result.success) {
            modifiedXml = result.xml;
            changes.push(`Added new ${componentToAdd} component`);
            return { modifiedXml, changes };
          }
        }
      }

      // 5. PROPERTY MODIFICATIONS
      const propertyPatterns = [
        /(?:make|set|change)\s+(\w+)\s+(?:size|width|height)\s+(?:to\s+)?(\d+)/i,
        /resize\s+(\w+)\s+to\s+(\d+)/i,
        /(?:make|set)\s+(\w+)\s+(?:color|colour)\s+(?:to\s+)?(\w+)/i
      ];

      for (const pattern of propertyPatterns) {
        const match = userInput.match(pattern);
        if (match) {
          const [, component, value] = match;
          const result = modifyComponentProperty(modifiedXml, component, value, userInput);
          if (result.success) {
            modifiedXml = result.xml;
            changes.push(result.message);
            return { modifiedXml, changes };
          }
        }
      }

      // 6. SMART CONTEXTUAL CHANGES - Analyze the entire input for context
      const contextualResult = handleContextualChanges(modifiedXml, userInput);
      if (contextualResult.success) {
        modifiedXml = contextualResult.xml;
        changes.push(...contextualResult.changes);
        return { modifiedXml, changes };
      }

    } catch (error) {
      console.error('Error in XML processing:', error);
    }

    return { modifiedXml, changes };
  };

  // Helper function to remove components from XML
  const removeComponent = (xml: string, componentName: string): { success: boolean; xml: string } => {
    try {
      const componentRegex = new RegExp(`<mxCell[^>]*value="[^"]*${componentName}[^"]*"[^>]*>.*?</mxCell>`, 'gis');
      const matches = xml.match(componentRegex);
      
      if (matches && matches.length > 0) {
        let modifiedXml = xml;
        matches.forEach(match => {
          modifiedXml = modifiedXml.replace(match, '');
        });
        
        // Also remove any connections to this component
        const idMatches = xml.match(new RegExp(`id="([^"]*)"[^>]*value="[^"]*${componentName}[^"]*"`, 'i'));
        if (idMatches) {
          const componentId = idMatches[1];
          const connectionRegex = new RegExp(`<mxCell[^>]*(?:source|target)="${componentId}"[^>]*>.*?</mxCell>`, 'gis');
          modifiedXml = modifiedXml.replace(connectionRegex, '');
        }
        
        return { success: true, xml: modifiedXml };
      }
    } catch (error) {
      console.error('Error removing component:', error);
    }
    return { success: false, xml };
  };

  // Helper function to replace components in XML
  const replaceComponent = (xml: string, fromComponent: string, toComponent: string): { success: boolean; xml: string; count: number } => {
    try {
      const regex = new RegExp(`\\b${fromComponent}\\b`, 'gi');
      const matches = xml.match(regex);
      
      if (matches && matches.length > 0) {
        const modifiedXml = xml.replace(regex, toComponent.toUpperCase());
        return { success: true, xml: modifiedXml, count: matches.length };
      }
    } catch (error) {
      console.error('Error replacing component:', error);
    }
    return { success: false, xml, count: 0 };
  };

  // Helper function to find component ID by name (fully dynamic)
  const findComponentId = (xml: string, componentName: string): string => {
    console.log('findComponentId called for:', componentName);
    const cells = xml.split('<mxCell').slice(1);
    const compLower = componentName.toLowerCase();

    console.log('Searching through', cells.length, 'cells');

    for (const cell of cells) {
      const idMatch = cell.match(/id="([^"]*)"/);
      const valueMatch = cell.match(/value="([^"]*)"/);

      if (idMatch && valueMatch) {
        const cellId = idMatch[1];
        let cellValue = valueMatch[1];

        // Decode HTML entities more thoroughly
        cellValue = cellValue
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/&/g, '&')
          .replace(/"/g, '"')
          .replace(/<br\s*\/?>/g, ' ')
          .replace(/<[^>]*>/g, '')
          .trim();

        const cellLower = cellValue.toLowerCase();

        console.log('Comparing:', compLower, 'with cell:', cellLower, 'id:', cellId);

        // Exact match
        if (cellLower === compLower) {
          console.log('Found exact match for:', componentName, 'id:', cellId);
          return cellId;
        }

        // Component name contains cell value or vice versa
        if (cellLower.includes(compLower) || compLower.includes(cellLower)) {
          console.log('Found partial match for:', componentName, 'id:', cellId);
          return cellId;
        }

        // Word-based matching (split on spaces and check individual words)
        const compWords = compLower.split(/\s+/);
        const cellWords = cellLower.split(/\s+/);

        // Check if any word from component name matches any word in cell value
        for (const compWord of compWords) {
          for (const cellWord of cellWords) {
            if (compWord === cellWord && compWord.length > 1) {
              console.log('Found word match for:', componentName, 'id:', cellId);
              return cellId;
            }
          }
        }

        // Partial word matching (for cases like "Data" matching "Data Watchpoints")
        for (const compWord of compWords) {
          if (cellLower.includes(compWord) && compWord.length > 2) {
            console.log('Found partial word match for:', componentName, 'id:', cellId);
            return cellId;
          }
        }

        // Special case: if component name has multiple words, check if all words are in cell value
        if (compWords.length > 1) {
          const allWordsFound = compWords.every(word =>
            cellLower.includes(word) && word.length > 1
          );
          if (allWordsFound) {
            console.log('Found all words match for:', componentName, 'id:', cellId);
            return cellId;
          }
        }
      }
    }

    return '';
  };

  // Helper function to add connections
  const addConnection = (xml: string, component1: string, component2: string): { success: boolean; xml: string; message: string } => {
    try {
      // Find the last mxCell to get the next ID
      const cellMatches = xml.match(/id="(\d+)"/g) || [];
      const maxId = Math.max(...cellMatches.map(match => parseInt(match.match(/\d+/)?.[0] || '0')));
      const newId = maxId + 1;

      // Find component IDs dynamically
      const sourceId = findComponentId(xml, component1);
      const targetId = findComponentId(xml, component2);

      if (!sourceId || !targetId) {
        return { success: false, xml, message: `Could not find components "${component1}" and "${component2}" to connect` };
      }

      // Create new connection XML
      const newConnection = `
        <mxCell id="${newId}" style="endArrow=classic;html=1;rounded=0;" parent="1" source="${sourceId}" target="${targetId}" edge="1">
          <mxGeometry width="50" height="50" relative="1" as="geometry">
            <mxPoint x="0" y="0" as="sourcePoint" />
            <mxPoint x="100" y="100" as="targetPoint" />
          </mxGeometry>
        </mxCell>`;

      // Insert before the closing root tag
      const modifiedXml = xml.replace('</root>', newConnection + '\n    </root>');

      return {
        success: true,
        xml: modifiedXml,
        message: `Added connection between ${component1} and ${component2}`
      };
    } catch (error) {
      console.error('Error adding connection:', error);
    }
    return { success: false, xml, message: 'Failed to add connection' };
  };

  // Helper function to remove connections
  const removeConnections = (xml: string, component1?: string, component2?: string): { success: boolean; xml: string; message: string } => {
    try {
      let modifiedXml = xml;
      let removedCount = 0;

      if (component1 && component2) {
        // Find component IDs dynamically
        const sourceId = findComponentId(xml, component1);
        const targetId = findComponentId(xml, component2);

        if (!sourceId || !targetId) {
          return { success: false, xml, message: `Could not find components "${component1}" and "${component2}" to disconnect` };
        }

        // Remove connections between these specific components (bidirectional)
        const connectionRegex = new RegExp(`<mxCell[^>]*(?:source="${sourceId}"[^>]*target="${targetId}"|source="${targetId}"[^>]*target="${sourceId}")[^>]*edge="1"[^>]*>.*?</mxCell>`, 'gis');
        const connections = xml.match(connectionRegex) || [];

        connections.forEach(connection => {
          modifiedXml = modifiedXml.replace(connection, '');
          removedCount++;
        });

        return {
          success: removedCount > 0,
          xml: modifiedXml,
          message: `Removed ${removedCount} connection(s) between ${component1} and ${component2}`
        };
      } else {
        // Remove all arrows/connections
        const arrowRegex = /<mxCell[^>]*edge="1"[^>]*>.*?<\/mxCell>/gis;
        const arrows = xml.match(arrowRegex) || [];
        removedCount = arrows.length;

        if (removedCount > 0) {
          modifiedXml = xml.replace(arrowRegex, '');
          return {
            success: true,
            xml: modifiedXml,
            message: `Removed ${removedCount} arrow(s)/connection(s) from the diagram`
          };
        }
      }
    } catch (error) {
      console.error('Error removing connections:', error);
    }
    return { success: false, xml, message: 'No connections found to remove' };
  };

  // Helper function to add components
  const addComponent = (xml: string, componentName: string): { success: boolean; xml: string } => {
    try {
      // Find the last mxCell to get the next ID
      const cellMatches = xml.match(/id="(\d+)"/g) || [];
      const maxId = Math.max(...cellMatches.map(match => parseInt(match.match(/\d+/)?.[0] || '0')));
      const newId = maxId + 1;

      // Create new component XML
      const newComponent = `
        <mxCell id="${newId}" value="${componentName.toUpperCase()}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="400" y="200" width="120" height="60" as="geometry" />
        </mxCell>`;

      // Insert before the closing root tag
      const modifiedXml = xml.replace('</root>', newComponent + '\n    </root>');
      return { success: true, xml: modifiedXml };
    } catch (error) {
      console.error('Error adding component:', error);
    }
    return { success: false, xml };
  };

  // Helper function to add components with spatial positioning
  const addComponentWithPosition = (xml: string, componentName: string, referenceComponent?: string, secondReference?: string, userInput?: string): { success: boolean; xml: string; message: string } => {
    try {
      console.log('addComponentWithPosition called with:', componentName, referenceComponent, secondReference);
      // Find the last mxCell to get the next ID
      const cellMatches = xml.match(/id="(\d+)"/g) || [];
      const maxId = Math.max(...cellMatches.map(match => parseInt(match.match(/\d+/)?.[0] || '0')));
      const newId = maxId + 1;

      let x = 400;
      let y = 200;
      let message = `Added new ${componentName.toUpperCase()} component`;

      if (referenceComponent && secondReference) {
        // "between X and Y" positioning - find components dynamically
        const ref1Id = findComponentId(xml, referenceComponent);
        const ref2Id = findComponentId(xml, secondReference);

        console.log('Found component IDs:', ref1Id, ref2Id, 'for components:', referenceComponent, secondReference);

        if (ref1Id && ref2Id) {
          // Extract positions from XML - more robust approach
          const cells = xml.split('<mxCell').slice(1);
          let ref1X = 0, ref1Y = 0, ref2X = 0, ref2Y = 0;
          let foundRef1 = false, foundRef2 = false;

          for (const cell of cells) {
            const idMatch = cell.match(/id="([^"]*)"/);
            if (idMatch) {
              const cellId = idMatch[1];
              const geometryMatch = cell.match(/<mxGeometry[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"/);

              if (geometryMatch) {
                const cellX = parseFloat(geometryMatch[1]);
                const cellY = parseFloat(geometryMatch[2]);

                if (cellId === ref1Id) {
                  ref1X = cellX;
                  ref1Y = cellY;
                  foundRef1 = true;
                } else if (cellId === ref2Id) {
                  ref2X = cellX;
                  ref2Y = cellY;
                  foundRef2 = true;
                }
              }
            }
          }

          if (foundRef1 && foundRef2) {
            // Position in the middle, accounting for component sizes
            const cells = xml.split('<mxCell').slice(1);
            let ref1Width = 120, ref1Height = 60, ref2Width = 120, ref2Height = 60;

            for (const cell of cells) {
              const idMatch = cell.match(/id="([^"]*)"/);
              if (idMatch) {
                const cellId = idMatch[1];
                const geometryMatch = cell.match(/<mxGeometry[^>]*width="([^"]*)"[^>]*height="([^"]*)"/);

                if (geometryMatch) {
                  if (cellId === ref1Id) {
                    ref1Width = parseFloat(geometryMatch[1]);
                    ref1Height = parseFloat(geometryMatch[2]);
                  } else if (cellId === ref2Id) {
                    ref2Width = parseFloat(geometryMatch[2]);
                    ref2Height = parseFloat(geometryMatch[3]);
                  }
                }
              }
            }

            // Calculate center position between the two components
            const centerX1 = ref1X + ref1Width / 2;
            const centerY1 = ref1Y + ref1Height / 2;
            const centerX2 = ref2X + ref2Width / 2;
            const centerY2 = ref2Y + ref2Height / 2;

            x = (centerX1 + centerX2) / 2 - 60; // Center horizontally, adjust for component width
            y = (centerY1 + centerY2) / 2 - 30; // Center vertically, adjust for component height

            message = `Added ${componentName.toUpperCase()} between ${referenceComponent} and ${secondReference}`;
          }
        }
      } else if (referenceComponent) {
        // Positioning relative to a single component - find dynamically
        const refId = findComponentId(xml, referenceComponent);

        if (refId) {
          // Extract position and size from XML
          const geometryMatch = xml.match(new RegExp(`<mxCell[^>]*id="${refId}"[^>]*>.*?<mxGeometry[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"`));

          if (geometryMatch) {
            const refX = parseFloat(geometryMatch[1]);
            const refY = parseFloat(geometryMatch[2]);
            const refWidth = parseFloat(geometryMatch[3]);
            const refHeight = parseFloat(geometryMatch[4]);

            const lowerInput = userInput?.toLowerCase() || '';

            if (lowerInput.includes('beside') || lowerInput.includes('next to') || lowerInput.includes('right')) {
              x = refX + refWidth + 20;
              y = refY;
              message = `Added ${componentName.toUpperCase()} beside ${referenceComponent}`;
            } else if (lowerInput.includes('left')) {
              x = refX - 140;
              y = refY;
              message = `Added ${componentName.toUpperCase()} to the left of ${referenceComponent}`;
            } else if (lowerInput.includes('above') || lowerInput.includes('top')) {
              x = refX;
              y = refY - 80;
              message = `Added ${componentName.toUpperCase()} above ${referenceComponent}`;
            } else if (lowerInput.includes('below') || lowerInput.includes('bottom')) {
              x = refX;
              y = refY + refHeight + 20;
              message = `Added ${componentName.toUpperCase()} below ${referenceComponent}`;
            } else {
              // Default: beside
              x = refX + refWidth + 20;
              y = refY;
              message = `Added ${componentName.toUpperCase()} beside ${referenceComponent}`;
            }
          }
        }
      }

      // Create new component XML
      const newComponent = `
        <mxCell id="${newId}" value="${componentName.toUpperCase()}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry" />
        </mxCell>`;

      // Insert before the closing root tag
      const modifiedXml = xml.replace('</root>', newComponent + '\n    </root>');
      return { success: true, xml: modifiedXml, message };
    } catch (error) {
      console.error('Error adding component with position:', error);
    }
    return { success: false, xml, message: 'Failed to add component' };
  };

  // Helper function to modify component properties
  const modifyComponentProperty = (xml: string, component: string, value: string, userInput: string): { success: boolean; xml: string; message: string } => {
    try {
      const lowerInput = userInput.toLowerCase();
      let modifiedXml = xml;
      
      if (lowerInput.includes('size') || lowerInput.includes('width') || lowerInput.includes('height')) {
        const sizeRegex = new RegExp(`(<mxCell[^>]*value="[^"]*${component}[^"]*"[^>]*>.*?<mxGeometry[^>]*width=")[^"]*("[^>]*height=")[^"]*(".*?</mxCell>)`, 'gis');
        modifiedXml = xml.replace(sizeRegex, `$1${value}$2${value}$3`);
        return { success: true, xml: modifiedXml, message: `Changed ${component.toUpperCase()} size to ${value}x${value}` };
      }
      
      if (lowerInput.includes('color') || lowerInput.includes('colour')) {
        const colorMap: { [key: string]: string } = {
          'red': '#ff0000', 'blue': '#0000ff', 'green': '#00ff00', 'yellow': '#ffff00',
          'orange': '#ffa500', 'purple': '#800080', 'pink': '#ffc0cb', 'gray': '#808080'
        };
        const colorCode = colorMap[value.toLowerCase()] || value;
        const colorRegex = new RegExp(`(<mxCell[^>]*value="[^"]*${component}[^"]*"[^>]*style="[^"]*fillColor=)[^;]*(;[^"]*"[^>]*>.*?</mxCell>)`, 'gis');
        modifiedXml = xml.replace(colorRegex, `$1${colorCode}$2`);
        return { success: true, xml: modifiedXml, message: `Changed ${component.toUpperCase()} color to ${value}` };
      }
    } catch (error) {
      console.error('Error modifying component property:', error);
    }
    return { success: false, xml, message: 'Property modification failed' };
  };

  // Advanced contextual analysis for complex requests
  const handleContextualChanges = (xml: string, userInput: string): { success: boolean; xml: string; changes: string[] } => {
    const changes: string[] = [];
    let modifiedXml = xml;
    
    try {
      // Extract all components mentioned in the input
      const words = userInput.toLowerCase().split(/\s+/);
      const potentialComponents = words.filter(word => 
        word.length > 2 && 
        !['the', 'and', 'or', 'to', 'from', 'with', 'by', 'as', 'into', 'remove', 'add', 'change', 'make'].includes(word)
      );
      
      // Check if any of these components exist in the XML
      for (const component of potentialComponents) {
        const componentExists = xml.toLowerCase().includes(component);
        if (componentExists) {
          // Apply intelligent modifications based on context
          if (userInput.toLowerCase().includes('bigger') || userInput.toLowerCase().includes('larger')) {
            const result = modifyComponentProperty(modifiedXml, component, '150', 'make bigger');
            if (result.success) {
              modifiedXml = result.xml;
              changes.push(`Made ${component.toUpperCase()} larger`);
            }
          }
          
          if (userInput.toLowerCase().includes('smaller')) {
            const result = modifyComponentProperty(modifiedXml, component, '80', 'make smaller');
            if (result.success) {
              modifiedXml = result.xml;
              changes.push(`Made ${component.toUpperCase()} smaller`);
            }
          }
        }
      }
      
      return { success: changes.length > 0, xml: modifiedXml, changes };
    } catch (error) {
      console.error('Error in contextual analysis:', error);
    }
    
    return { success: false, xml, changes: [] };
  };

  const generateAIResponse = (userInput: string, xml: string, actualChanges: string[]): string => {
    // If we made actual changes, give a simple success message
    if (actualChanges.length > 0) {
      return `✅ Done! ${actualChanges.join('. ')}\n\nCheck the Viewer tab to see changes.`;
    }

    // For unrecognized commands, give a simple help message
    return `🤖 I can help modify your architecture.\n\nTry commands like:\n• "add COMPONENT between X and Y"\n• "remove arrow between X and Y"\n• "add connection between X and Y"\n• "remove COMPONENT"\n• "change X to Y"\n\nWhat would you like to change?`;
  };

  // Helper function to extract component names from XML
  const extractComponentsFromXml = (xml: string): string[] => {
    try {
      const valueMatches = xml.match(/value="([^"]+)"/g) || [];
      const components = valueMatches
        .map(match => match.replace(/value="|"/g, ''))
        .filter(value => value && value.length > 0 && !value.includes('<') && !value.includes('mxCell'))
        .filter((value, index, array) => array.indexOf(value) === index) // Remove duplicates
        .slice(0, 10); // Limit to first 10 components
      
      return components.length > 0 ? components : ['No components detected'];
    } catch (error) {
      console.error('Error extracting components:', error);
      return ['Error reading components'];
    }
  };


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-col">
        {/* Chat Messages */}
        <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 animate-slide-in ${
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.type === 'ai' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                
                <Card
                  className={`max-w-[80%] p-3 ${
                    message.type === 'user'
                      ? 'bg-primary text-primary-foreground ml-auto'
                      : 'bg-secondary/50'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <span className="text-xs opacity-70 mt-2 block">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </Card>

                {message.type === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-accent-foreground" />
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 animate-slide-in">
                <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary-foreground animate-pulse" />
                </div>
                <Card className="p-3 bg-secondary/50">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="space-y-2">
          {!hasFiles && (
            <Card className="p-3 bg-destructive/10 border-destructive/20">
              <p className="text-sm text-destructive">
                📁 Please upload your architecture files first to start chatting
              </p>
            </Card>
          )}
          
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={hasFiles ? "Ask me to modify your architecture..." : "Upload files first..."}
              disabled={!hasFiles || isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!hasFiles || !inputValue.trim() || isLoading}
              className="bg-gradient-primary hover:shadow-glow-primary transition-all duration-300"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
