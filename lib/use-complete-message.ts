import { useEffect, useState } from 'react';
import { useAssistantRuntime } from '@assistant-ui/react';

/**
 * Custom hook to handle fetching the complete message after SSE completion
 * This addresses the issue where tool outputs are not included in the SSE stream
 */
export function useCompleteMessage() {
  const runtime = useAssistantRuntime();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Function to handle the completion of an SSE stream
    const handleStreamComplete = async (event: any) => {
      // Check if this is a completion event
      if (event.type === 'done' && event.detail?.response) {
        const response = event.detail.response;
        
        // Check if this response needs a complete message fetch
        const needsCompleteMessage = response.headers.get('X-Needs-Complete-Message') === 'true';
        const conversationId = response.headers.get('X-Conversation-ID');
        
        if (needsCompleteMessage && conversationId && !isProcessing) {
          setIsProcessing(true);
          
          try {
            console.log('Fetching complete message for conversation:', conversationId);
            
            // Fetch the complete conversation
            const completeResponse = await fetch(`/api/conversation/${conversationId}`);
            
            if (!completeResponse.ok) {
              throw new Error(`Failed to fetch complete message: ${completeResponse.statusText}`);
            }
            
            const data = await completeResponse.json();
            
            if (data.conversation && data.conversation.conversation) {
              // Parse the conversation JSON
              const parsedConversation = typeof data.conversation.conversation === 'string' 
                ? JSON.parse(data.conversation.conversation) 
                : data.conversation.conversation;
              
              // Get the last assistant message
              const lastAssistantMessage = parsedConversation
                .filter((msg: any) => msg.role === 'assistant')
                .pop();
              
              if (lastAssistantMessage && runtime) {
                console.log('Found complete assistant message:', lastAssistantMessage.content.length);
                
                // Update the runtime with the complete message
                // Use the runtime API to access and update messages
                // @ts-ignore - Runtime has these methods but TypeScript doesn't know about them
                const messages = runtime.messages || [];
                const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                
                if (lastMessage && lastMessage.role === 'assistant') {
                  // Replace the last message with the complete one
                  // @ts-ignore - Runtime has these methods but TypeScript doesn't know about them
                  runtime.addMessage({
                    role: 'assistant',
                    content: lastAssistantMessage.content,
                    id: lastMessage.id
                  });
                  
                  console.log('Updated message with complete content');
                }
              }
            }
          } catch (error) {
            console.error('Error fetching complete message:', error);
          } finally {
            setIsProcessing(false);
          }
        }
      }
    };

    // Add event listener for SSE completion
    window.addEventListener('assistant:stream:complete', handleStreamComplete);
    
    // Clean up
    return () => {
      window.removeEventListener('assistant:stream:complete', handleStreamComplete);
    };
  }, [runtime, isProcessing]);

  return null;
} 