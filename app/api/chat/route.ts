import { openai } from "@ai-sdk/openai";
import { jsonSchema, streamText } from "ai";
import { executeReadQuery, executeWriteQuery, saveConversation, updateConversation, logChatCall } from "@/lib/database";
import { systemPrompt } from "@/lib/system-prompt";

export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, threadId } = await req.json();
  const startTime = Date.now();

  // Define a function to log errors
  const logError = (error: any) => {
    console.error('Error in chat API:', error);
    return { error: error.message || 'An unknown error occurred' };
  };

  try {
    // Create a buffer to accumulate the assistant's response
    let assistantResponseBuffer = '';
    
    // Stream the response
    const result = streamText({
      model: openai("gpt-4o"),
      messages,
      system: systemPrompt,
      temperature: 0,
      maxTokens: 1500,
      // Set tool choice to auto to ensure the model uses tools when appropriate
      toolChoice: "auto",
      tools: {
        query: {
          description: "Execute a read-only SQL query against the database",
          parameters: jsonSchema({
            type: "object",
            properties: {
              sql: {
                type: "string",
                description: "The SQL query to execute (SELECT only)"
              }
            },
            required: ["sql"]
          }),
          execute: async ({ sql }) => {
            console.log('Executing read query:', sql);
            try {
              // Validate that this is a read-only query
              if (!sql.trim().toLowerCase().startsWith('select')) {
                throw new Error('Only SELECT queries are allowed with this tool. For write operations, use the executeWrite tool.');
              }
              
              const result = await executeReadQuery(sql);
              console.log('Read query result:', result);
              
              if (result.error) {
                const errorMessage = `Error executing query: ${result.error.message || 'Unknown error'}`;
                assistantResponseBuffer += `\n${errorMessage}\n`;
                return errorMessage;
              }
              
              // Check if this is a COUNT query
              const isCountQuery = sql.toLowerCase().includes('count(') || sql.toLowerCase().includes('count (');
              
              if (isCountQuery) {
                // Extract count value from the result
                let countValue = null;
                
                if (Array.isArray(result.data) && result.data.length > 0) {
                  // Try to find count value in the first row
                  const firstRow = result.data[0];
                  
                  // Look for common count column names
                  const countKeys = ['count', 'count(*)', 'entity_count', 'total'];
                  for (const key of Object.keys(firstRow)) {
                    if (countKeys.includes(key.toLowerCase()) || key.toLowerCase().includes('count')) {
                      countValue = firstRow[key];
                      break;
                    }
                  }
                  
                  // If no specific count column found, use the first numeric value
                  if (countValue === null) {
                    for (const key of Object.keys(firstRow)) {
                      if (typeof firstRow[key] === 'number') {
                        countValue = firstRow[key];
                        break;
                      }
                    }
                  }
                }
                
                // Return a formatted string with the count result
                const countMessage = `The query returned a count of ${countValue !== null ? countValue : 'unknown'}. Here is the raw result: ${JSON.stringify(result.data)}`;
                assistantResponseBuffer += `\n${countMessage}\n`;
                return countMessage;
              }
              
              // For regular table queries, format as a markdown table
              if (Array.isArray(result.data) && result.data.length > 0) {
                try {
                  // Get column headers from the first row
                  const headers = Object.keys(result.data[0]);
                  
                  // Create markdown table header
                  let markdownTable = '| ' + headers.join(' | ') + ' |\n';
                  markdownTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
                  
                  // Add rows to the table
                  result.data.forEach((row: Record<string, any>) => {
                    markdownTable += '| ' + headers.map(header => {
                      const value = row[header];
                      return value !== null && value !== undefined ? String(value) : '';
                    }).join(' | ') + ' |\n';
                  });
                  
                  const tableMessage = `Here are the query results:\n\n${markdownTable}`;
                  assistantResponseBuffer += `\n${tableMessage}\n`;
                  return tableMessage;
                } catch (formatError) {
                  console.error('Error formatting table:', formatError);
                  // Fallback to JSON if table formatting fails
                  const jsonMessage = `Here are the query results: ${JSON.stringify(result.data, null, 2)}`;
                  assistantResponseBuffer += `\n${jsonMessage}\n`;
                  return jsonMessage;
                }
              } else if (Array.isArray(result.data) && result.data.length === 0) {
                const emptyMessage = `The query returned no results.`;
                assistantResponseBuffer += `\n${emptyMessage}\n`;
                return emptyMessage;
              } else {
                // For other types of results, return as JSON
                const jsonMessage = `Here are the query results: ${JSON.stringify(result.data, null, 2)}`;
                assistantResponseBuffer += `\n${jsonMessage}\n`;
                return jsonMessage;
              }
            } catch (error: any) {
              console.error('Error executing read query:', error);
              const errorMessage = `Error executing query: ${error.message || 'Unknown error'}`;
              assistantResponseBuffer += `\n${errorMessage}\n`;
              return errorMessage;
            }
          }
        },
        executeWrite: {
          description: "Execute a write SQL query (INSERT, UPDATE, DELETE) with confirmation",
          parameters: jsonSchema({
            type: "object",
            properties: {
              sql: {
                type: "string",
                description: "The SQL query to execute (INSERT, UPDATE, DELETE)"
              },
              confirmed: {
                type: "boolean",
                description: "Whether the user has confirmed the write operation"
              }
            },
            required: ["sql", "confirmed"]
          }),
          execute: async ({ sql, confirmed }) => {
            console.log('Executing write query:', sql, 'confirmed:', confirmed);
            try {
              // Only execute if confirmed
              if (!confirmed) {
                const confirmMessage = `Write operation requires confirmation. Please confirm to execute this SQL: ${sql}`;
                assistantResponseBuffer += `\n${confirmMessage}\n`;
                return confirmMessage;
              }
              
              // Validate that this is a write query
              const queryType = sql.trim().toLowerCase().split(' ')[0];
              if (!['insert', 'update', 'delete'].includes(queryType)) {
                throw new Error('Only INSERT, UPDATE, and DELETE queries are allowed with this tool.');
              }
              
              const result = await executeWriteQuery(sql);
              console.log('Write query result:', result);
              
              if (result.error) {
                const errorMessage = `Error executing write query: ${result.error.message || 'Unknown error'}`;
                assistantResponseBuffer += `\n${errorMessage}\n`;
                return errorMessage;
              }
              
              const successMessage = `Write operation (${queryType.toUpperCase()}) completed successfully.`;
              assistantResponseBuffer += `\n${successMessage}\n`;
              return successMessage;
            } catch (error: any) {
              console.error('Error executing write query:', error);
              const errorMessage = `Error executing write query: ${error.message || 'Unknown error'}`;
              assistantResponseBuffer += `\n${errorMessage}\n`;
              return errorMessage;
            }
          }
        }
      }
    });

    // Process the response
    const response = result.toDataStreamResponse();
    
    // Handle conversation persistence after the response is complete
    setTimeout(async () => {
      try {
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        // Get the last user message for generating a title
        const lastUserMessage = messages.find((m: any) => m.role === 'user')?.content || '';
        const title = lastUserMessage.length > 50 
          ? lastUserMessage.substring(0, 50) + '...' 
          : lastUserMessage;
        
        // Use the accumulated buffer for the assistant's message
        // If the buffer is empty, try to get the response from result.toString()
        const assistantMessage = assistantResponseBuffer || result.toString() || 'Response processed';
        
        // Add the assistant's response to the messages
        const updatedMessages = [
          ...messages, 
          { role: 'assistant', content: assistantMessage }
        ];
        
        // Save or update the conversation
        let conversationId: number | null = null;
        
        if (threadId) {
          // Update existing conversation
          await updateConversation(parseInt(threadId), title, updatedMessages);
          conversationId = parseInt(threadId);
        } else {
          // Create new conversation
          conversationId = await saveConversation(title, updatedMessages);
        }
        
        // Log the chat call
        if (conversationId) {
          await logChatCall(
            conversationId,
            0, // We don't have token counts from the API
            0,
            0,
            'gpt-4o',
            'READ', // Default to READ, we could determine this from the messages
            executionTime,
            'success'
          );
        }
      } catch (error) {
        console.error('Error persisting conversation:', error);
      }
    }, 100);

    return response;
  } catch (error) {
    return new Response(JSON.stringify(logError(error)), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
