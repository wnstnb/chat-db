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
    
    // Variable to store the conversation ID
    let conversationId: number | null = threadId ? parseInt(threadId) : null;
    
    // Track tool outputs to ensure they're included in the final response
    let toolOutputs: string[] = [];
    
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
                return "Error: Only SELECT queries are allowed with this tool. For write operations, use the executeWrite tool.";
              }
              
              const result = await executeReadQuery(sql);
              console.log('Read query result:', result);
              
              if (result.error) {
                const errorMessage = `Error executing query: ${result.error.message || 'Unknown error'}`;
                toolOutputs.push(errorMessage);
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
                const countResult = `The query returned a count of ${countValue !== null ? countValue : 'unknown'}. Here is the raw result: ${JSON.stringify(result.data)}`;
                toolOutputs.push(countResult);
                return countResult;
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
                  
                  const tableResult = `Here are the query results:\n\n${markdownTable}`;
                  toolOutputs.push(tableResult);
                  return tableResult;
                } catch (formatError) {
                  console.error('Error formatting table:', formatError);
                  // Fallback to JSON if table formatting fails
                  const jsonResult = `Here are the query results: ${JSON.stringify(result.data, null, 2)}`;
                  toolOutputs.push(jsonResult);
                  return jsonResult;
                }
              } else if (Array.isArray(result.data) && result.data.length === 0) {
                const noResultsMessage = `The query returned no results.`;
                toolOutputs.push(noResultsMessage);
                return noResultsMessage;
              } else {
                // For other types of results, return as JSON
                const jsonResult = `Here are the query results: ${JSON.stringify(result.data, null, 2)}`;
                toolOutputs.push(jsonResult);
                return jsonResult;
              }
            } catch (error: any) {
              console.error('Error executing read query:', error);
              const errorMessage = `Error executing query: ${error.message || 'Unknown error'}`;
              toolOutputs.push(errorMessage);
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
                toolOutputs.push(confirmMessage);
                return confirmMessage;
              }
              
              // Validate that this is a write query
              const queryType = sql.trim().toLowerCase().split(' ')[0];
              if (!['insert', 'update', 'delete'].includes(queryType)) {
                const errorMessage = `Error: Only INSERT, UPDATE, and DELETE queries are allowed with this tool.`;
                toolOutputs.push(errorMessage);
                return errorMessage;
              }
              
              const result = await executeWriteQuery(sql);
              console.log('Write query result:', result);
              
              if (result.error) {
                const errorMessage = `Error executing write query: ${result.error.message || 'Unknown error'}`;
                toolOutputs.push(errorMessage);
                return errorMessage;
              }
              
              const successMessage = `Write operation (${queryType.toUpperCase()}) completed successfully.`;
              toolOutputs.push(successMessage);
              return successMessage;
            } catch (error: any) {
              console.error('Error executing write query:', error);
              const errorMessage = `Error executing write query: ${error.message || 'Unknown error'}`;
              toolOutputs.push(errorMessage);
              return errorMessage;
            }
          }
        }
      },
      onFinish: async (completion) => {
        // This callback is called when the stream is complete
        // Now we have the full response, so we can save it to the database
        try {
          const endTime = Date.now();
          const executionTime = endTime - startTime;
          
          // Get the last user message for generating a title
          const lastUserMessage = messages.find((m: any) => m.role === 'user')?.content || '';
          const title = lastUserMessage.length > 50 
            ? lastUserMessage.substring(0, 50) + '...' 
            : lastUserMessage;
          
          // Get the complete assistant's response
          let assistantMessage = completion.toString();
          console.log('Initial assistant message length:', assistantMessage.length);
          
          // Check if any tool outputs are missing from the response
          // If so, append them to ensure they're included
          for (const toolOutput of toolOutputs) {
            if (!assistantMessage.includes(toolOutput)) {
              console.log('Tool output missing from response, appending it:', toolOutput.substring(0, 50) + '...');
              
              // If the message is very short, it might be just a greeting or acknowledgment
              // In that case, append the tool output directly
              if (assistantMessage.length < 50) {
                assistantMessage += '\n\n' + toolOutput;
              } else {
                // Otherwise, try to find a good place to insert the tool output
                // Look for phrases like "Here's the result" or "The query returned"
                const insertPhrases = [
                  'Here is the result',
                  'Here are the results',
                  'The query returned',
                  'Here\'s what I found',
                  'The results show',
                  'Based on the query'
                ];
                
                let inserted = false;
                for (const phrase of insertPhrases) {
                  const index = assistantMessage.indexOf(phrase);
                  if (index !== -1) {
                    // Insert after the phrase and the sentence it's in
                    const endOfSentence = assistantMessage.indexOf('.', index);
                    if (endOfSentence !== -1) {
                      assistantMessage = 
                        assistantMessage.substring(0, endOfSentence + 1) + 
                        '\n\n' + toolOutput + '\n\n' + 
                        assistantMessage.substring(endOfSentence + 1);
                      inserted = true;
                      break;
                    }
                  }
                }
                
                // If we couldn't find a good place to insert, just append to the end
                if (!inserted) {
                  assistantMessage += '\n\n' + toolOutput;
                }
              }
            }
          }
          
          console.log('Final assistant message length for persistence:', assistantMessage.length);
          
          // Add the assistant's response to the messages
          const updatedMessages = [
            ...messages, 
            { role: 'assistant', content: assistantMessage }
          ];
          
          // Save or update the conversation
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
          
          console.log('Conversation saved with ID:', conversationId);
        } catch (error) {
          console.error('Error persisting conversation:', error);
        }
      }
    });

    // Process the response
    const response = result.toDataStreamResponse();
    
    // Add the conversation ID to the response headers if it exists
    if (conversationId) {
      response.headers.set('X-Conversation-ID', conversationId.toString());
    }

    return response;
  } catch (error) {
    return new Response(JSON.stringify(logError(error)), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
