import { supabase, Conversation, ChatCallInfo } from './supabase';

// Save a conversation to the database
export async function saveConversation(
  title: string,
  conversation: any[]
): Promise<number | null> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      title,
      conversation: JSON.stringify(conversation),
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error saving conversation:', error);
    return null;
  }

  return data.id;
}

// Update an existing conversation
export async function updateConversation(
  id: number,
  title: string,
  conversation: any[]
): Promise<boolean> {
  const { error } = await supabase
    .from('conversations')
    .update({
      title,
      conversation: JSON.stringify(conversation),
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating conversation:', error);
    return false;
  }

  return true;
}

// Get a conversation by ID
export async function getConversation(id: number): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error getting conversation:', error);
    return null;
  }

  return data as Conversation;
}

// Get all conversations
export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting conversations:', error);
    return [];
  }

  return data as Conversation[];
}

// Delete a conversation
export async function deleteConversation(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting conversation:', error);
    return false;
  }

  return true;
}

// Log chat call information
export async function logChatCall(
  conversation_id: number,
  prompt_tokens: number,
  completion_tokens: number,
  total_tokens: number,
  model_version: string,
  query_type: 'READ' | 'WRITE',
  execution_time: number,
  status: string,
  error_message: string | null = null
): Promise<boolean> {
  const { error } = await supabase
    .from('chat_call_info')
    .insert({
      conversation_id,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      model_version,
      query_type,
      execution_time,
      status,
      error_message,
    });

  if (error) {
    console.error('Error logging chat call:', error);
    return false;
  }

  return true;
}

// Execute a read-only SQL query
export async function executeReadQuery(query: string, params: any[] = []): Promise<any> {
  try {
    console.log('Executing read query in database.ts:', query);
    
    // Remove semicolons from the end of the query
    const cleanQuery = query.trim().endsWith(';') ? query.trim().slice(0, -1) : query.trim();
    
    // Check if the query is a SELECT query
    if (!cleanQuery.toLowerCase().startsWith('select')) {
      return { 
        data: null, 
        error: new Error('Only SELECT queries are allowed with this function') 
      };
    }
    
    // Execute the query using the Supabase RPC function
    try {
      const { data, error } = await supabase.rpc('execute_read_query', {
        query_text: cleanQuery,
        query_params: params,
      });

      if (error) {
        console.error('Error executing read query with RPC:', error);
        throw error;
      }

      return { data, error: null };
    } catch (rpcError) {
      console.error('Error in RPC execution:', rpcError);
      
      // If RPC fails, try direct query as a fallback
      try {
        // For simple queries, we can try to execute them directly
        if (cleanQuery.toLowerCase().startsWith('select * from')) {
          const tableName = cleanQuery.toLowerCase().split('from')[1].trim().split(' ')[0].trim();
          console.log(`Attempting direct query on table: ${tableName}`);
          
          const { data: directData, error: directError } = await supabase
            .from(tableName)
            .select('*');
            
          if (directError) throw directError;
          return { data: directData, error: null };
        }
        
        throw new Error('Cannot execute complex queries directly. Please ensure the RPC function is properly set up.');
      } catch (directError) {
        console.error('Error in direct query execution:', directError);
        throw directError;
      }
    }
  } catch (error) {
    console.error('Error executing read query:', error);
    return { data: null, error };
  }
}

// Execute a write SQL query with confirmation
export async function executeWriteQuery(query: string, params: any[] = []): Promise<any> {
  try {
    console.log('Executing write query in database.ts:', query);
    
    // Remove semicolons from the end of the query
    const cleanQuery = query.trim().endsWith(';') ? query.trim().slice(0, -1) : query.trim();
    
    // Check if the query is a write query
    const queryType = cleanQuery.toLowerCase().split(' ')[0];
    if (!['insert', 'update', 'delete'].includes(queryType)) {
      return { 
        data: null, 
        error: new Error('Only INSERT, UPDATE, and DELETE queries are allowed with this function') 
      };
    }
    
    // Execute the query using the Supabase RPC function
    try {
      const { data, error } = await supabase.rpc('execute_write_query', {
        query_text: cleanQuery,
        query_params: params,
      });

      if (error) {
        console.error('Error executing write query with RPC:', error);
        throw error;
      }

      return { data, error: null };
    } catch (rpcError) {
      console.error('Error in RPC execution for write query:', rpcError);
      throw rpcError;
    }
  } catch (error) {
    console.error('Error executing write query:', error);
    return { data: null, error };
  }
} 