"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/thread";
import { ThreadList } from "@/components/thread-list";
import { useEffect } from "react";

export const Assistant = () => {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  // Set up event listeners for SSE completion
  useEffect(() => {
    const handleFetch = async (response: Response) => {
      // Check if this is a response from our chat API
      if (response.url.includes('/api/chat')) {
        // Create a clone of the response to read headers
        const clonedResponse = response.clone();
        
        // Dispatch a custom event when the stream is complete
        // This will be caught by our useCompleteMessage hook
        const reader = clonedResponse.body?.getReader();
        
        if (reader) {
          // Read the stream to completion
          const processStream = async () => {
            try {
              while (true) {
                const { done } = await reader.read();
                if (done) {
                  // Stream is complete, dispatch event
                  window.dispatchEvent(new CustomEvent('assistant:stream:complete', {
                    detail: { response: clonedResponse }
                  }));
                  break;
                }
              }
            } catch (error) {
              console.error('Error processing stream:', error);
            }
          };
          
          processStream();
        }
      }
      
      return response;
    };

    // Patch the global fetch to intercept responses
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      return handleFetch(response);
    };

    // Clean up
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid h-dvh grid-cols-[250px_1fr] gap-x-4 px-4 py-4">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold mb-4">Chat-DB</h1>
          <p className="text-sm text-gray-500 mb-4">Database Assistant</p>
          <ThreadList />
        </div>
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
};
