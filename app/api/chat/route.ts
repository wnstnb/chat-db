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
                const errorMessage = "Error: Only SELECT queries are allowed with this tool. For write operations, use the executeWrite tool.";
                toolOutputs.push(errorMessage);
                return `IMPORTANT: Include this exact error in your response: ${errorMessage}

CRITICAL: You MUST include the above text VERBATIM in your response. Do not paraphrase or summarize it.`;
              }
              
              // Special handling for GROUP BY queries to avoid syntax errors
              let modifiedSql = sql;
              if (sql.toLowerCase().includes('group by')) {
                console.log('Detected GROUP BY query, using special handling');
                
                // Ensure the query has proper aliases for aggregated columns
                if (sql.toLowerCase().includes('count(*)') && !sql.toLowerCase().includes('as ')) {
                  modifiedSql = sql.replace(/COUNT\(\*\)/i, 'COUNT(*) AS count');
                  console.log('Modified query to add alias:', modifiedSql);
                }
              }
              
              const result = await executeReadQuery(modifiedSql);
              console.log('Read query result:', result);
              
              if (result.error) {
                const errorMessage = `Error executing query: ${result.error.message || JSON.stringify(result.error) || 'Unknown error'}`;
                console.error('Query error details:', result.error);
                toolOutputs.push(errorMessage);
                return `IMPORTANT: Include this exact error in your response: ${errorMessage}

CRITICAL: You MUST include the above text VERBATIM in your response. Do not paraphrase or summarize it.`;
              }
              
              // Check if this is a COUNT query
              const isCountQuery = sql.toLowerCase().includes('count(') || sql.toLowerCase().includes('count (');
              
              if (isCountQuery) {
                // Extract count value from the result
                let countValue = null;
                
                // Special case for the specific query we're debugging
                const isEntityCountQuery = sql.toLowerCase().includes('count(*) as entity_count from entities');
                if (isEntityCountQuery) {
                  console.log('Detected entity count query, using special handling');
                  // Log the raw result for debugging
                  console.log('Raw entity count result:', JSON.stringify(result.data));
                  
                  // Try to extract the count directly from the raw result
                  if (Array.isArray(result.data) && result.data.length > 0) {
                    // The result should be in the format [{"entity_count": 15}]
                    const firstRow = result.data[0];
                    // Try different case variations of the column name
                    const possibleKeys = ['entity_count', 'ENTITY_COUNT', 'Entity_Count'];
                    for (const key of possibleKeys) {
                      if (key in firstRow) {
                        countValue = firstRow[key];
                        console.log(`Found entity count in ${key} column: ${countValue}`);
                        break;
                      }
                    }
                    
                    // If still not found, try to find any key that contains 'count'
                    if (countValue === null) {
                      for (const key of Object.keys(firstRow)) {
                        if (key.toLowerCase().includes('count')) {
                          countValue = firstRow[key];
                          console.log(`Found entity count in ${key} column: ${countValue}`);
                          break;
                        }
                      }
                    }
                    
                    // If still not found, just use the first value
                    if (countValue === null && Object.keys(firstRow).length > 0) {
                      const firstKey = Object.keys(firstRow)[0];
                      countValue = firstRow[firstKey];
                      console.log(`Using first value from ${firstKey} column as count: ${countValue}`);
                    }
                  }
                }
                
                if (Array.isArray(result.data) && result.data.length > 0) {
                  // Try to find count value in the first row
                  const firstRow = result.data[0];
                  console.log('Count query first row:', JSON.stringify(firstRow));
                  console.log('Count query first row keys:', Object.keys(firstRow));
                  
                  // Special case for entity_count column which is commonly used in our queries
                  if ('entity_count' in firstRow) {
                    countValue = firstRow.entity_count;
                    console.log(`Found count value in entity_count column: ${countValue}`);
                  } else if ('ENTITY_COUNT' in firstRow) {
                    countValue = firstRow.ENTITY_COUNT;
                    console.log(`Found count value in ENTITY_COUNT column: ${countValue}`);
                  } else {
                    // Try to find the key case-insensitively
                    const entityCountKey = Object.keys(firstRow).find(
                      key => key.toLowerCase() === 'entity_count'
                    );
                    
                    if (entityCountKey) {
                      countValue = firstRow[entityCountKey];
                      console.log(`Found count value in case-insensitive entity_count column (${entityCountKey}): ${countValue}`);
                    } else {
                      // Look for common count column names
                      const countKeys = ['count', 'count(*)', 'entity_count', 'total', 'entity_count'];
                      
                      // First, try exact matches with common count column names
                      for (const key of Object.keys(firstRow)) {
                        console.log(`Checking key: ${key}, value: ${firstRow[key]}, type: ${typeof firstRow[key]}`);
                        const keyLower = key.toLowerCase();
                        if (countKeys.includes(keyLower)) {
                          countValue = firstRow[key];
                          console.log(`Found count value in exact match key ${key}: ${countValue}`);
                          break;
                        }
                      }
                      
                      // If no exact match, try partial matches
                      if (countValue === null) {
                        for (const key of Object.keys(firstRow)) {
                          const keyLower = key.toLowerCase();
                          if (keyLower.includes('count') || keyLower.includes('total') || keyLower.includes('num')) {
                            countValue = firstRow[key];
                            console.log(`Found count value in partial match key ${key}: ${countValue}`);
                            break;
                          }
                        }
                      }
                      
                      // If still no match, use the first numeric value
                      if (countValue === null) {
                        for (const key of Object.keys(firstRow)) {
                          if (typeof firstRow[key] === 'number') {
                            countValue = firstRow[key];
                            console.log(`Found count value as first numeric value in key ${key}: ${countValue}`);
                            break;
                          }
                        }
                      }
                      
                      // If still no match and there's only one value in the row, use that
                      if (countValue === null && Object.keys(firstRow).length === 1) {
                        const onlyKey = Object.keys(firstRow)[0];
                        countValue = firstRow[onlyKey];
                        console.log(`Using only value in row from key ${onlyKey}: ${countValue}`);
                      }
                    }
                  }
                }
                
                // If we still don't have a count value but have raw data, try to extract it from the raw data
                if (countValue === null && result.data) {
                  console.log('Attempting to extract count from raw data:', JSON.stringify(result.data));
                  
                  // If the raw data is a simple number, use that
                  if (typeof result.data === 'number') {
                    countValue = result.data;
                    console.log(`Using raw data as count value: ${countValue}`);
                  }
                  // If there's only one row with one column, use that value
                  else if (Array.isArray(result.data) && result.data.length === 1) {
                    const row = result.data[0];
                    if (typeof row === 'object' && Object.keys(row).length === 1) {
                      countValue = row[Object.keys(row)[0]];
                      console.log(`Extracted count from single-value result: ${countValue}`);
                    }
                    // If the row itself is a number, use that
                    else if (typeof row === 'number') {
                      countValue = row;
                      console.log(`Using row as count value: ${countValue}`);
                    }
                  }
                  // If the raw data is an array with a single number, use that
                  else if (Array.isArray(result.data) && result.data.length === 1 && typeof result.data[0] === 'number') {
                    countValue = result.data[0];
                    console.log(`Using first array element as count value: ${countValue}`);
                  }
                }
                
                // If we have a raw result that's just a number, use that as the count
                if (countValue === null && !isNaN(parseInt(JSON.stringify(result.data)))) {
                  countValue = parseInt(JSON.stringify(result.data));
                  console.log(`Parsed count value from raw data: ${countValue}`);
                }
                
                // Return a formatted string with the count result
                const countResult = `The query returned a count of ${countValue !== null ? countValue : 'unknown'}. Here is the raw result: ${JSON.stringify(result.data)}`;
                toolOutputs.push(countResult);
                
                // For debugging, log the final count result
                console.log('Final count result:', countResult);
                
                // Add instructions to ensure the AI includes this in its response
                return `IMPORTANT: Include this exact result in your response: ${countResult}`;
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
                  return `IMPORTANT: Include this exact result in your response: ${tableResult}`;
                } catch (formatError) {
                  console.error('Error formatting table:', formatError);
                  // Fallback to JSON if table formatting fails
                  const jsonResult = `Here are the query results: ${JSON.stringify(result.data, null, 2)}`;
                  toolOutputs.push(jsonResult);
                  return `IMPORTANT: Include this exact result in your response: ${jsonResult}`;
                }
              } else if (Array.isArray(result.data) && result.data.length === 0) {
                const noResultsMessage = `The query returned no results.`;
                toolOutputs.push(noResultsMessage);
                return `IMPORTANT: Include this exact result in your response: ${noResultsMessage}`;
              } else {
                // For other types of results, return as JSON
                const jsonResult = `Here are the query results: ${JSON.stringify(result.data, null, 2)}`;
                toolOutputs.push(jsonResult);
                return `IMPORTANT: Include this exact result in your response: ${jsonResult}`;
              }
            } catch (error: any) {
              console.error('Error executing read query:', error);
              const errorMessage = `Error executing query: ${error.message || 'Unknown error'}`;
              toolOutputs.push(errorMessage);
              return `IMPORTANT: Include this exact error in your response: ${errorMessage}`;
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
                return `IMPORTANT: Include this exact message in your response: ${confirmMessage}`;
              }
              
              // Validate that this is a write query
              const queryType = sql.trim().toLowerCase().split(' ')[0];
              if (!['insert', 'update', 'delete'].includes(queryType)) {
                const errorMessage = `Error: Only INSERT, UPDATE, and DELETE queries are allowed with this tool.`;
                toolOutputs.push(errorMessage);
                return `IMPORTANT: Include this exact error in your response: ${errorMessage}`;
              }
              
              const result = await executeWriteQuery(sql);
              console.log('Write query result:', result);
              
              if (result.error) {
                const errorMessage = `Error executing write query: ${result.error.message || 'Unknown error'}`;
                toolOutputs.push(errorMessage);
                return `IMPORTANT: Include this exact error in your response: ${errorMessage}`;
              }
              
              const successMessage = `Write operation (${queryType.toUpperCase()}) completed successfully.`;
              toolOutputs.push(successMessage);
              return `IMPORTANT: Include this exact message in your response: ${successMessage}`;
            } catch (error: any) {
              console.error('Error executing write query:', error);
              const errorMessage = `Error executing write query: ${error.message || 'Unknown error'}`;
              toolOutputs.push(errorMessage);
              return `IMPORTANT: Include this exact error in your response: ${errorMessage}`;
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
          
          // Check if the message starts with [object Object], which indicates a toString() issue
          if (assistantMessage.startsWith('[object Object]')) {
            console.log('Detected [object Object] in response, attempting to fix');
            // Try to extract the actual text content
            // First, remove the [object Object] prefix
            assistantMessage = assistantMessage.replace('[object Object]', '').trim();
            
            // If the message is now empty or just contains the tool output, try to get the text another way
            if (assistantMessage === '' || toolOutputs.some(output => assistantMessage.trim() === output.trim())) {
              console.log('Attempting to extract text content from completion object');
              
              // Use a safer approach with try-catch to handle any type errors
              try {
                // Try to convert the completion object to a plain object
                const completionObj = JSON.parse(JSON.stringify(completion));
                console.log('Completion object structure:', Object.keys(completionObj));
                
                // Look for text-like properties in the object
                if (completionObj && typeof completionObj === 'object') {
                  // Try common property names that might contain the text
                  for (const key of ['text', 'content', 'message', 'response', 'answer', 'value']) {
                    if (completionObj[key] && typeof completionObj[key] === 'string') {
                      assistantMessage = completionObj[key];
                      console.log(`Extracted text from completion.${key}`);
                      break;
                    }
                  }
                }
              } catch (e) {
                console.error('Error extracting text from completion object:', e);
                // If all else fails, ensure we at least have the tool output
                if (assistantMessage === '') {
                  assistantMessage = toolOutputs.join('\n\n');
                  console.log('Using tool outputs as fallback for assistant message');
                }
              }
            }
          }
          
          console.log('Processed assistant message:', assistantMessage.substring(0, 100) + '...');
          
          // Check the structure of the last message to determine how to format the assistant's response
          const lastMessage = messages[messages.length - 1];
          let assistantContent;
          
          // Log the structure of the messages for debugging
          console.log('Messages structure:', JSON.stringify(messages.map((m: any) => ({ role: m.role, contentType: typeof m.content })), null, 2));
          console.log('Last message content type:', typeof lastMessage.content);
          if (typeof lastMessage.content === 'object') {
            console.log('Last message content:', JSON.stringify(lastMessage.content, null, 2));
          }
          
          // If the last message has a structured content, format the assistant's response similarly
          if (lastMessage && typeof lastMessage.content === 'object' && Array.isArray(lastMessage.content)) {
            assistantContent = [{ type: 'text', text: assistantMessage }];
            console.log('Using structured content for assistant message');
          } else {
            // Otherwise, use the string directly
            assistantContent = assistantMessage;
            console.log('Using string content for assistant message');
          }
          
          // Create an array to hold all messages
          let updatedMessages = [
            ...messages, 
            { role: 'assistant', content: assistantContent }
          ];
          
          // Check if there are any tool outputs that should be added as separate messages
          if (toolOutputs.length > 0) {
            console.log('Adding tool outputs as separate messages');
            
            // For each tool output, add a new assistant message
            for (const toolOutput of toolOutputs) {
              // Only add the tool output as a separate message if it's not already included in the assistant's response
              if (!assistantMessage.includes(toolOutput)) {
                console.log('Adding tool output as separate message:', toolOutput.substring(0, 50) + '...');
                
                // Create the content based on the format of the last message
                let toolOutputContent;
                if (lastMessage && typeof lastMessage.content === 'object' && Array.isArray(lastMessage.content)) {
                  toolOutputContent = [{ type: 'text', text: toolOutput }];
                } else {
                  toolOutputContent = toolOutput;
                }
                
                // Add the tool output as a separate assistant message
                updatedMessages.push({
                  role: 'assistant',
                  content: toolOutputContent
                });
              }
            }
          }
          
          console.log('Updated messages structure:', JSON.stringify(updatedMessages.map((m: any) => ({ role: m.role, contentType: typeof m.content })), null, 2));
          
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

