"use client";

import { useCallback, useEffect, useState } from 'react';
import { 
  AssistantRuntimeProvider, 
  ThreadMessage, 
  useAssistantRuntime 
} from '@assistant-ui/react';
import { loadConversations, loadConversationById, saveConversation } from './supabase';
import { convertToSql, isReadOnlyQuery } from './sql-utils';
import { executeQuery } from './supabase';

// Define the structure of our conversation state
export interface ConversationState {
  id?: number;
  title: string;
  messages: ThreadMessage[];
  created_at?: string;
}

// SQL Tool definition
const sqlTool = {
  name: 'query',
  description: 'Run a read-only SQL query',
  parameters: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
      },
    },
  },
};

// SQL Tool implementation
async function handleSqlTool(sql: string) {
  try {
    // Execute the query
    const result = await executeQuery(sql);
    return { result };
  } catch (error) {
    console.error('Error executing SQL query:', error);
    return { error: String(error) };
  }
}

// Create a custom runtime for Supabase
export function SupabaseRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<ConversationState[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load all conversations on initial render
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setIsLoading(true);
        const data = await loadConversations();
        const formattedConversations = data.map(conv => ({
          id: conv.id,
          title: conv.title,
          messages: Array.isArray(conv.conversation) ? conv.conversation : [],
          created_at: conv.created_at,
        }));
        setConversations(formattedConversations);
      } catch (error) {
        console.error('Error loading conversations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
  }, []);

  // Load a specific conversation
  const loadConversation = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      const conversation = await loadConversationById(id);
      setCurrentConversationId(conversation.id);
      return {
        id: conversation.id,
        title: conversation.title,
        messages: Array.isArray(conversation.conversation) ? conversation.conversation : [],
      };
    } catch (error) {
      console.error('Error loading conversation:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save the current conversation
  const saveCurrentConversation = useCallback(async (messages: ThreadMessage[], title: string) => {
    try {
      const result = await saveConversation(messages, title);
      if (result && result[0]) {
        setCurrentConversationId(result[0].id);
        
        // Update the conversations list
        setConversations(prev => {
          const index = prev.findIndex(conv => conv.id === result[0].id);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = {
              id: result[0].id,
              title,
              messages,
            };
            return updated;
          } else {
            return [
              {
                id: result[0].id,
                title,
                messages,
              },
              ...prev,
            ];
          }
        });
        
        return result[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error saving conversation:', error);
      return null;
    }
  }, []);

  // Create a new conversation
  const createNewConversation = useCallback(() => {
    setCurrentConversationId(null);
  }, []);

  // Get all conversations
  const getAllConversations = useCallback(() => {
    return conversations;
  }, [conversations]);

  // System prompt for the assistant
  const systemPrompt = `You are a helpful assistant that can answer questions about documents and data stored in a PostgreSQL database. 
You can translate natural language questions into SQL queries and execute them to retrieve information.

When a user asks a question that requires querying the database:
1. Analyze the question to determine what data is needed
2. Generate a SQL query to retrieve that data
3. Execute the query using the 'query' tool
4. Explain the results in a clear, concise manner

For any SQL operations that modify the database (INSERT, UPDATE, DELETE, etc.), you must:
1. Generate the SQL query
2. Show the query to the user
3. Ask for explicit confirmation before execution
4. Only execute after receiving confirmation

Always format SQL code blocks with proper syntax highlighting.`;

  // Create the runtime
  const runtime = useAssistantRuntime({
    api: "/api/chat",
    system: systemPrompt,
    tools: {
      query: sqlTool,
    },
    onToolCall: async (tool, args) => {
      if (tool === 'query') {
        const { sql } = args as { sql: string };
        
        // Check if this is a read-only query
        if (!isReadOnlyQuery(sql)) {
          // For modifying queries, we need confirmation
          return {
            result: "This query will modify the database. Please confirm that you want to execute it by saying 'Yes, execute this query'.",
            pendingQuery: sql,
          };
        }
        
        // For read-only queries, execute immediately
        return await handleSqlTool(sql);
      }
      return null;
    },
    onMessageCreate: async (message) => {
      // Check if this is a confirmation for a pending query
      const lastAssistantMessage = message.threadMessages
        .slice()
        .reverse()
        .find(msg => msg.role === 'assistant');
      
      const userMessage = message.content;
      
      if (lastAssistantMessage?.metadata?.custom?.pendingQuery && 
          userMessage.toLowerCase().includes('yes, execute this query')) {
        const pendingQuery = lastAssistantMessage.metadata.custom.pendingQuery as string;
        const result = await handleSqlTool(pendingQuery);
        return {
          content: `Query executed: \`${pendingQuery}\`\n\nResult: ${JSON.stringify(result.result, null, 2)}`,
        };
      }
      
      // Check if this is a natural language query that should be converted to SQL
      if (userMessage.toLowerCase().includes('query') || 
          userMessage.toLowerCase().includes('database') ||
          userMessage.toLowerCase().includes('data') ||
          userMessage.toLowerCase().includes('sql')) {
        try {
          const sqlQuery = await convertToSql(userMessage);
          
          // If it's a read-only query, suggest using the query tool
          if (isReadOnlyQuery(sqlQuery)) {
            return {
              content: userMessage,
              metadata: {
                custom: {
                  suggestedSqlQuery: sqlQuery,
                },
              },
            };
          }
        } catch (error) {
          console.error('Error converting to SQL:', error);
        }
      }
      
      return { content: userMessage };
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
} 