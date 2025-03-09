"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/thread";
import { ThreadList } from "@/components/thread-list";
import { useEffect, useRef, useState } from "react";

export const Assistant = () => {
  // State to force re-renders
  const [forceUpdate, setForceUpdate] = useState(0);
  
  // Reference to track if we need to refresh the UI after streaming completes
  const streamCompleteRef = useRef(false);
  
  const runtime = useChatRuntime({
    api: "/api/chat",
    // Add configuration to ensure we handle the complete response
    onFinish: () => {
      console.log("Stream finished, ensuring UI is updated with complete response");
      // Mark that streaming is complete
      streamCompleteRef.current = true;
      
      // Force a re-render after a short delay to ensure the UI shows the complete response
      setTimeout(() => {
        console.log("Forcing re-render to show complete response");
        // Increment the state to force a re-render
        setForceUpdate(prev => prev + 1);
      }, 500);
    }
  });
  
  // Log when a re-render is triggered
  useEffect(() => {
    if (forceUpdate > 0) {
      console.log(`Re-render triggered (${forceUpdate})`);
    }
  }, [forceUpdate]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid h-dvh grid-cols-[250px_1fr] gap-x-4 px-4 py-4">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold mb-4">Chat-DB</h1>
          <p className="text-sm text-gray-500 mb-4">Database Assistant</p>
          <ThreadList />
        </div>
        {/* Add the forceUpdate as a key to force Thread to re-render */}
        <Thread key={`thread-${forceUpdate}`} />
      </div>
    </AssistantRuntimeProvider>
  );
};
