"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/thread";
import { ThreadList } from "@/components/thread-list";
import { QueryToolUI, WriteQueryToolUI } from "./components/query-tool-ui";
import { ThemeToggle } from "@/components/theme-toggle";

export const Assistant = () => {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid h-dvh grid-cols-[250px_1fr] gap-x-4 px-4 py-4 overflow-hidden">
        <div className="flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Chat-DB</h1>
            <ThemeToggle />
          </div>
          <p className="text-sm text-muted-foreground mb-4">Database Assistant</p>
          <ThreadList />
        </div>
        <div className="relative flex flex-col h-full overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <Thread />
          </div>
          <div className="absolute bottom-[72px] left-0 right-0 z-10 pointer-events-none">
            <div className="pointer-events-auto">
              <QueryToolUI />
              <WriteQueryToolUI />
            </div>
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
};
