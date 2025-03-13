"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { useEffect, useState } from "react";

type QueryArgs = {
  sql: string;
};

type QueryResult = string;

// Helper function to convert markdown table to HTML with styling
const markdownTableToHtml = (markdownTable: string): string => {
  if (!markdownTable.includes('|')) return markdownTable;
  
  const lines = markdownTable.trim().split('\n');
  if (lines.length < 3) return markdownTable; // Not a proper table
  
  let html = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-border border border-border rounded">';
  
  // Process header
  const headerRow = lines[0];
  const headerCells = headerRow.split('|').filter(cell => cell.trim() !== '');
  html += '<thead class="bg-muted"><tr>';
  headerCells.forEach(cell => {
    html += `<th class="px-4 py-2 text-left text-sm font-semibold text-foreground">${cell.trim()}</th>`;
  });
  html += '</tr></thead>';
  
  // Process body
  html += '<tbody class="divide-y divide-border">';
  for (let i = 2; i < lines.length; i++) {
    const row = lines[i];
    const cells = row.split('|').filter(cell => cell.trim() !== '');
    html += '<tr class="hover:bg-muted/50">';
    cells.forEach((cell, index) => {
      // If this is a count column, right-align it
      const isCount = headerCells[index]?.toLowerCase().includes('count');
      const alignment = isCount ? 'text-right' : 'text-left';
      html += `<td class="px-4 py-2 text-sm text-foreground ${alignment}">${cell.trim()}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  
  return html;
};

// Function to format query results
const formatQueryResult = (displayResult: string): string => {
  // Check if the result already contains a properly formatted markdown table
  if (displayResult.includes('| ') && displayResult.includes(' |') && displayResult.includes('---')) {
    console.log('Result already contains a markdown table, using as is');
    return displayResult;
  }

  // Check if this is a raw JSON result that needs formatting
  const isRawJson = !displayResult.includes('Error executing query:') && 
                   !displayResult.includes('{"error":') && 
                   !displayResult.includes('|') && 
                   (displayResult.includes('[{') || 
                    displayResult.includes('Here is the raw result:'));

  // Format raw JSON results
  let formattedResult = displayResult;
  if (isRawJson) {
    try {
      // Extract JSON data
      let jsonData;
      let jsonString = '';
      
      console.log('Raw display result:', displayResult);
      
      // Use a more compatible regex approach for multiline matching
      const rawResultIndex = displayResult.indexOf('Here is the raw result:');
      if (rawResultIndex !== -1) {
        jsonString = displayResult.substring(rawResultIndex + 'Here is the raw result:'.length).trim();
        console.log('Extracted JSON string from raw result:', jsonString);
        try {
          jsonData = JSON.parse(jsonString);
          console.log('Parsed JSON data:', jsonData);
        } catch (parseError) {
          console.error('Error parsing JSON from raw result:', parseError);
          // Try to clean the string before parsing
          const cleanedString = jsonString.replace(/\\"/g, '"').replace(/\\n/g, '');
          console.log('Cleaned JSON string:', cleanedString);
          try {
            jsonData = JSON.parse(cleanedString);
            console.log('Parsed JSON data after cleaning:', jsonData);
          } catch (cleanParseError) {
            console.error('Error parsing cleaned JSON:', cleanParseError);
            
            // Try one more approach - look for array-like structures
            try {
              // Sometimes the JSON is malformed but still contains the data
              // Try to extract just the array part
              const arrayMatch = cleanedString.match(/\[\s*\{.*\}\s*\]/);
              if (arrayMatch) {
                const arrayString = arrayMatch[0];
                console.log('Extracted array string:', arrayString);
                jsonData = JSON.parse(arrayString);
                console.log('Parsed array data:', jsonData);
              }
            } catch (arrayParseError) {
              console.error('Error parsing array:', arrayParseError);
            }
          }
        }
      } else if (displayResult.includes('Here are the query results:')) {
        const queryResultsIndex = displayResult.indexOf('Here are the query results:');
        if (queryResultsIndex !== -1) {
          jsonString = displayResult.substring(queryResultsIndex + 'Here are the query results:'.length).trim();
          console.log('Extracted JSON string from query results:', jsonString);
          try {
            jsonData = JSON.parse(jsonString);
            console.log('Parsed JSON data:', jsonData);
          } catch (parseError) {
            console.error('Error parsing JSON from query results:', parseError);
            // Try to clean the string before parsing
            const cleanedString = jsonString.replace(/\\"/g, '"').replace(/\\n/g, '');
            console.log('Cleaned JSON string:', cleanedString);
            try {
              jsonData = JSON.parse(cleanedString);
              console.log('Parsed JSON data after cleaning:', jsonData);
            } catch (cleanParseError) {
              console.error('Error parsing cleaned JSON:', cleanParseError);
            }
          }
        }
      }

      // If we still don't have valid JSON data, try to extract it from the text
      if (!jsonData) {
        // Look for anything that looks like JSON array in the text
        const startBracket = displayResult.indexOf('[{');
        const endBracket = displayResult.lastIndexOf('}]');
        if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
          jsonString = displayResult.substring(startBracket, endBracket + 2);
          console.log('Extracted JSON array from text:', jsonString);
          try {
            jsonData = JSON.parse(jsonString);
            console.log('Parsed JSON array:', jsonData);
          } catch (parseError) {
            console.error('Error parsing JSON array:', parseError);
            
            // Try with a more lenient approach
            try {
              // Replace single quotes with double quotes
              const fixedString = jsonString.replace(/'/g, '"');
              jsonData = JSON.parse(fixedString);
              console.log('Parsed JSON array after fixing quotes:', jsonData);
            } catch (fixedParseError) {
              console.error('Error parsing fixed JSON array:', fixedParseError);
            }
          }
        }
      }

      if (jsonData && Array.isArray(jsonData)) {
        // Create a markdown table from the JSON data
        if (jsonData.length > 0) {
          const headers = Object.keys(jsonData[0]);
          let markdownTable = '| ' + headers.join(' | ') + ' |\n';
          markdownTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
          
          jsonData.forEach((row) => {
            markdownTable += '| ' + headers.map(header => {
              const value = row[header];
              return value !== null && value !== undefined ? String(value) : '';
            }).join(' | ') + ' |\n';
          });
          
          // Replace the raw JSON with the markdown table
          if (rawResultIndex !== -1) {
            const beforeResult = displayResult.substring(0, rawResultIndex);
            formattedResult = beforeResult + `Here are the query results:\n\n${markdownTable}`;
          } else {
            formattedResult = `Here are the query results:\n\n${markdownTable}`;
          }
          
          console.log('Generated markdown table:', markdownTable);
        } else {
          console.log('JSON data is an empty array');
        }
      } else {
        console.log('JSON data is not an array or is null:', jsonData);
      }
    } catch (error) {
      console.error('Error formatting JSON result:', error);
      // Keep the original result if formatting fails
    }
  } else {
    console.log('Result is not identified as raw JSON:', displayResult.substring(0, 100) + '...');
  }

  // Special handling for count queries
  if (displayResult.includes('The query returned a count of') || 
      displayResult.includes('count') || 
      displayResult.includes('COUNT')) {
    try {
      // First check if there's already a markdown table in the result
      if (displayResult.includes('| ') && displayResult.includes(' |') && displayResult.includes('---')) {
        console.log('Count result already contains a markdown table, using as is');
        return displayResult;
      }
      
      const countMatch = displayResult.match(/The query returned a count of (\d+)/);
      if (countMatch && countMatch[1]) {
        const count = parseInt(countMatch[1]);
        console.log('Detected count query with count:', count);
      }
      
      // Extract the raw result to get the labels and counts
      const rawResultIndex = displayResult.indexOf('Here is the raw result:');
      if (rawResultIndex !== -1) {
        let jsonString = displayResult.substring(rawResultIndex + 'Here is the raw result:'.length).trim();
        console.log('Extracted JSON string from count result:', jsonString);
        
        try {
          const jsonData = JSON.parse(jsonString);
          console.log('Parsed JSON data for count:', jsonData);
          
          if (Array.isArray(jsonData) && jsonData.length > 0) {
            // Create a better formatted result with a table
            const headers = Object.keys(jsonData[0]);
            let markdownTable = '| ' + headers.join(' | ') + ' |\n';
            markdownTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
            
            jsonData.forEach((row) => {
              markdownTable += '| ' + headers.map(header => {
                const value = row[header];
                return value !== null && value !== undefined ? String(value) : '';
              }).join(' | ') + ' |\n';
            });
            
            formattedResult = `The query returned ${jsonData.length} results:\n\n${markdownTable}`;
            console.log('Generated count table:', markdownTable);
            return formattedResult;
          }
        } catch (parseError) {
          console.error('Error parsing JSON from count result:', parseError);
          // Try to clean the string before parsing
          const cleanedString = jsonString.replace(/\\"/g, '"').replace(/\\n/g, '');
          console.log('Cleaned JSON string for count:', cleanedString);
          try {
            const jsonData = JSON.parse(cleanedString);
            console.log('Parsed JSON data for count after cleaning:', jsonData);
            
            if (Array.isArray(jsonData) && jsonData.length > 0) {
              // Create a better formatted result with a table
              const headers = Object.keys(jsonData[0]);
              let markdownTable = '| ' + headers.join(' | ') + ' |\n';
              markdownTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
              
              jsonData.forEach((row) => {
                markdownTable += '| ' + headers.map(header => {
                  const value = row[header];
                  return value !== null && value !== undefined ? String(value) : '';
                }).join(' | ') + ' |\n';
              });
              
              formattedResult = `The query returned ${jsonData.length} results:\n\n${markdownTable}`;
              console.log('Generated count table after cleaning:', markdownTable);
              return formattedResult;
            }
          } catch (cleanParseError) {
            console.error('Error parsing cleaned JSON for count:', cleanParseError);
            
            // Try one more approach - look for array-like structures
            try {
              // Sometimes the JSON is malformed but still contains the data
              // Try to extract just the array part
              const arrayMatch = cleanedString.match(/\[\s*\{.*\}\s*\]/);
              if (arrayMatch) {
                const arrayString = arrayMatch[0];
                console.log('Extracted array string from count:', arrayString);
                const jsonData = JSON.parse(arrayString);
                console.log('Parsed array data for count:', jsonData);
                
                if (Array.isArray(jsonData) && jsonData.length > 0) {
                  // Create a better formatted result with a table
                  const headers = Object.keys(jsonData[0]);
                  let markdownTable = '| ' + headers.join(' | ') + ' |\n';
                  markdownTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
                  
                  jsonData.forEach((row) => {
                    markdownTable += '| ' + headers.map(header => {
                      const value = row[header];
                      return value !== null && value !== undefined ? String(value) : '';
                    }).join(' | ') + ' |\n';
                  });
                  
                  formattedResult = `The query returned ${jsonData.length} results:\n\n${markdownTable}`;
                  console.log('Generated count table from array extraction:', markdownTable);
                  return formattedResult;
                }
              }
            } catch (arrayParseError) {
              console.error('Error parsing array for count:', arrayParseError);
            }
          }
        }
      }
      
      // If we still don't have a table, try to extract JSON directly from the text
      const startBracket = displayResult.indexOf('[{');
      const endBracket = displayResult.lastIndexOf('}]');
      if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
        const jsonString = displayResult.substring(startBracket, endBracket + 2);
        console.log('Extracted JSON array from count text:', jsonString);
        try {
          const jsonData = JSON.parse(jsonString);
          console.log('Parsed JSON array for count:', jsonData);
          
          if (Array.isArray(jsonData) && jsonData.length > 0) {
            // Create a better formatted result with a table
            const headers = Object.keys(jsonData[0]);
            let markdownTable = '| ' + headers.join(' | ') + ' |\n';
            markdownTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
            
            jsonData.forEach((row) => {
              markdownTable += '| ' + headers.map(header => {
                const value = row[header];
                return value !== null && value !== undefined ? String(value) : '';
              }).join(' | ') + ' |\n';
            });
            
            formattedResult = `The query returned ${jsonData.length} results:\n\n${markdownTable}`;
            console.log('Generated count table from direct extraction:', markdownTable);
            return formattedResult;
          }
        } catch (parseError) {
          console.error('Error parsing JSON array for count:', parseError);
        }
      }
    } catch (error) {
      console.error('Error formatting count result:', error);
      // Keep the original result if formatting fails
    }
  }

  return formattedResult;
};

export const QueryToolUI = makeAssistantToolUI<QueryArgs, QueryResult>({
  toolName: "query",
  render: ({ args, result, status }) => {
    // Always declare all hooks at the top level
    const [displayResult, setDisplayResult] = useState<string>("");
    const [formattedResult, setFormattedResult] = useState<string>("");
    const [formattedHtml, setFormattedHtml] = useState<string>("");
    const [isError, setIsError] = useState<boolean>(false);
    
    // Process the result whenever it changes
    useEffect(() => {
      if (!result) return;
      
      // Extract the actual result from the formatted string
      let extractedResult = result;
      const resultMatch = result.match(/IMPORTANT: Include this exact (?:result|error) in your response: ([\s\S]*?)(?:\n\nCRITICAL:|$)/);
      if (resultMatch && resultMatch[1]) {
        extractedResult = resultMatch[1].trim();
      }
      
      // Check if the result contains an error
      const hasError = extractedResult.includes('Error executing query:') || 
                      extractedResult.includes('{"error":');
      
      setDisplayResult(extractedResult);
      setIsError(hasError);
      
      if (!hasError) {
        // Format the result
        const formatted = formatQueryResult(extractedResult);
        setFormattedResult(formatted);
      }
    }, [result]);
    
    // Convert markdown tables to HTML with styling
    useEffect(() => {
      if (!formattedResult) return;
      
      if (formattedResult.includes('|')) {
        // Find markdown tables in the result
        const parts = formattedResult.split('\n\n');
        const processedParts = parts.map(part => {
          if (part.includes('|') && part.includes('\n')) {
            return markdownTableToHtml(part);
          }
          return part;
        });
        
        setFormattedHtml(processedParts.join('\n\n'));
      } else {
        setFormattedHtml(formattedResult);
      }
    }, [formattedResult]);
    
    if (status.type === "running") {
      return (
        <div className="p-4 bg-muted/50 rounded-md my-2 border border-border">
          <p className="font-mono text-sm text-foreground">Executing query: {args?.sql}</p>
          <div className="mt-2 animate-pulse text-foreground">Loading results...</div>
        </div>
      );
    }

    if (!result) {
      return null;
    }
    
    return (
      <div className={`p-4 ${isError ? 'bg-destructive/10' : 'bg-muted/50'} rounded-md my-2 border border-border`}>
        <p className="font-mono text-sm mb-2 text-foreground">Query: {args?.sql}</p>
        <div className="border-t border-border pt-2">
          <div className="prose dark:prose-invert max-w-none">
            {isError ? (
              <div className="text-destructive">
                <p><strong>Error:</strong></p>
                <pre className="bg-destructive/10 p-2 rounded border border-destructive/20">{displayResult}</pre>
                <p className="mt-2">Try modifying your query and running it again.</p>
              </div>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: formattedHtml || formattedResult || displayResult }} />
            )}
          </div>
        </div>
      </div>
    );
  },
});

export const WriteQueryToolUI = makeAssistantToolUI<
  { sql: string; confirmed: boolean },
  string
>({
  toolName: "executeWrite",
  render: ({ args, result, status }) => {
    // Always declare hooks at the top level
    const [displayResult, setDisplayResult] = useState<string>("");
    const [isError, setIsError] = useState<boolean>(false);
    
    // Process the result whenever it changes
    useEffect(() => {
      if (!result) return;
      
      // Extract the actual result from the formatted string
      let extractedResult = result;
      const resultMatch = result.match(/IMPORTANT: Include this exact (?:message|error) in your response: ([\s\S]*?)(?:\n\nCRITICAL:|$)/);
      if (resultMatch && resultMatch[1]) {
        extractedResult = resultMatch[1].trim();
      }
      
      // Check if the result contains an error
      const hasError = extractedResult.includes('Error') || 
                      extractedResult.includes('{"error":');
      
      setDisplayResult(extractedResult);
      setIsError(hasError);
    }, [result]);
    
    if (status.type === "running") {
      return (
        <div className="p-4 bg-muted/50 rounded-md my-2 border border-border">
          <p className="font-mono text-sm text-foreground">
            {args?.confirmed 
              ? `Executing write query: ${args?.sql}` 
              : `Preparing write query: ${args?.sql}`}
          </p>
          <div className="mt-2 animate-pulse text-foreground">Loading...</div>
        </div>
      );
    }

    if (!result) {
      return null;
    }

    return (
      <div className={`p-4 ${isError ? 'bg-destructive/10' : 'bg-muted/50'} rounded-md my-2 border border-border`}>
        <p className="font-mono text-sm mb-2 text-foreground">
          {args?.confirmed 
            ? `Write query: ${args?.sql}` 
            : `Write query preview: ${args?.sql}`}
        </p>
        <div className="border-t border-border pt-2">
          <div className="prose dark:prose-invert max-w-none">
            {isError ? (
              <div className="text-destructive">
                <p><strong>Error:</strong></p>
                <pre className="bg-destructive/10 p-2 rounded border border-destructive/20">{displayResult}</pre>
              </div>
            ) : (
              <p className="text-foreground">{displayResult}</p>
            )}
          </div>
        </div>
      </div>
    );
  },
}); 