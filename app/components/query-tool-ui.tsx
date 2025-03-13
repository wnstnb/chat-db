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
  
  let html = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-300 border border-gray-300 rounded">';
  
  // Process header
  const headerRow = lines[0];
  const headerCells = headerRow.split('|').filter(cell => cell.trim() !== '');
  html += '<thead class="bg-gray-100"><tr>';
  headerCells.forEach(cell => {
    html += `<th class="px-4 py-2 text-left text-sm font-semibold text-gray-900">${cell.trim()}</th>`;
  });
  html += '</tr></thead>';
  
  // Process body
  html += '<tbody class="divide-y divide-gray-200">';
  for (let i = 2; i < lines.length; i++) {
    const row = lines[i];
    const cells = row.split('|').filter(cell => cell.trim() !== '');
    html += '<tr class="hover:bg-gray-50">';
    cells.forEach((cell, index) => {
      // If this is a count column, right-align it
      const isCount = headerCells[index]?.toLowerCase().includes('count');
      const alignment = isCount ? 'text-right' : 'text-left';
      html += `<td class="px-4 py-2 text-sm text-gray-700 ${alignment}">${cell.trim()}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  
  return html;
};

export const QueryToolUI = makeAssistantToolUI<QueryArgs, QueryResult>({
  toolName: "query",
  render: ({ args, result, status }) => {
    const [formattedHtml, setFormattedHtml] = useState<string | null>(null);
    
    if (status.type === "running") {
      return (
        <div className="p-4 bg-gray-100 rounded-md my-2">
          <p className="font-mono text-sm">Executing query: {args?.sql}</p>
          <div className="mt-2 animate-pulse">Loading results...</div>
        </div>
      );
    }

    if (!result) {
      return null;
    }

    // Extract the actual result from the formatted string
    // The result might be in the format "IMPORTANT: Include this exact result in your response: {actualResult}"
    let displayResult = result;
    const resultMatch = result.match(/IMPORTANT: Include this exact (?:result|error) in your response: ([\s\S]*?)(?:\n\nCRITICAL:|$)/);
    if (resultMatch && resultMatch[1]) {
      displayResult = resultMatch[1].trim();
    }

    // Check if the result contains an error
    const isError = displayResult.includes('Error executing query:') || 
                    displayResult.includes('{"error":');
    
    // Check if this is a raw JSON result that needs formatting
    const isRawJson = !isError && !displayResult.includes('|') && (
      displayResult.includes('[{') || 
      displayResult.includes('Here is the raw result:')
    );

    // Format raw JSON results
    let formattedResult = displayResult;
    if (isRawJson) {
      try {
        // Extract JSON data
        let jsonData;
        const rawResultMatch = displayResult.match(/Here is the raw result: (.+)$/);
        if (rawResultMatch && rawResultMatch[1]) {
          jsonData = JSON.parse(rawResultMatch[1]);
        } else if (displayResult.includes('Here are the query results:')) {
          const jsonMatch = displayResult.match(/Here are the query results: (.+)$/);
          if (jsonMatch && jsonMatch[1]) {
            jsonData = JSON.parse(jsonMatch[1]);
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
            if (rawResultMatch) {
              formattedResult = displayResult.replace(rawResultMatch[0], `Here are the query results:\n\n${markdownTable}`);
            } else {
              formattedResult = `Here are the query results:\n\n${markdownTable}`;
            }
          }
        }
      } catch (error) {
        console.error('Error formatting JSON result:', error);
        // Keep the original result if formatting fails
      }
    }

    // Special handling for count queries
    if (displayResult.includes('The query returned a count of')) {
      try {
        const countMatch = displayResult.match(/The query returned a count of (\d+)/);
        if (countMatch && countMatch[1]) {
          const count = parseInt(countMatch[1]);
          
          // Extract the raw result to get the labels and counts
          const rawResultMatch = displayResult.match(/Here is the raw result: (.+)$/);
          if (rawResultMatch && rawResultMatch[1]) {
            const jsonData = JSON.parse(rawResultMatch[1]);
            
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
            }
          }
        }
      } catch (error) {
        console.error('Error formatting count result:', error);
        // Keep the original result if formatting fails
      }
    }
    
    // Convert markdown tables to HTML with styling
    useEffect(() => {
      if (formattedResult && formattedResult.includes('|')) {
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
    
    return (
      <div className={`p-4 ${isError ? 'bg-red-50' : 'bg-gray-100'} rounded-md my-2`}>
        <p className="font-mono text-sm mb-2">Query: {args?.sql}</p>
        <div className="border-t border-gray-300 pt-2">
          <div className="prose max-w-none">
            {isError ? (
              <div className="text-red-600">
                <p><strong>Error:</strong></p>
                <pre className="bg-red-50 p-2 rounded">{displayResult}</pre>
                <p className="mt-2">Try modifying your query and running it again.</p>
              </div>
            ) : (
              formattedHtml ? (
                <div dangerouslySetInnerHTML={{ __html: formattedHtml }} />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: formattedResult }} />
              )
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
    if (status.type === "running") {
      return (
        <div className="p-4 bg-gray-100 rounded-md my-2">
          <p className="font-mono text-sm">
            {args?.confirmed 
              ? `Executing write query: ${args?.sql}` 
              : `Preparing write query: ${args?.sql}`}
          </p>
          <div className="mt-2 animate-pulse">Loading...</div>
        </div>
      );
    }

    if (!result) {
      return null;
    }

    // Extract the actual result from the formatted string
    let displayResult = result;
    const resultMatch = result.match(/IMPORTANT: Include this exact (?:message|error) in your response: ([\s\S]*?)(?:\n\nCRITICAL:|$)/);
    if (resultMatch && resultMatch[1]) {
      displayResult = resultMatch[1].trim();
    }

    // Check if the result contains an error
    const isError = displayResult.includes('Error') || 
                    displayResult.includes('{"error":');

    return (
      <div className={`p-4 ${isError ? 'bg-red-50' : 'bg-gray-100'} rounded-md my-2`}>
        <p className="font-mono text-sm mb-2">
          {args?.confirmed 
            ? `Write query: ${args?.sql}` 
            : `Write query preview: ${args?.sql}`}
        </p>
        <div className="border-t border-gray-300 pt-2">
          <div className="prose max-w-none">
            {isError ? (
              <div className="text-red-600">
                <p><strong>Error:</strong></p>
                <pre className="bg-red-50 p-2 rounded">{displayResult}</pre>
              </div>
            ) : (
              <p>{displayResult}</p>
            )}
          </div>
        </div>
      </div>
    );
  },
}); 