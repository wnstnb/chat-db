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
      <div className="grid h-dvh grid-cols-[250px_1fr] gap-x-4 px-4 py-4">
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Chat-DB</h1>
            <ThemeToggle />
          </div>
          <p className="text-sm text-muted-foreground mb-4">Database Assistant</p>
          <ThreadList />
        </div>
        <div className="relative">
          <Thread />
          <QueryToolUI />
          <WriteQueryToolUI />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
};
