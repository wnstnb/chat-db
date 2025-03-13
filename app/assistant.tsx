"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/thread";
import { ThreadList } from "@/components/thread-list";
import { QueryToolUI, WriteQueryToolUI } from "./components/query-tool-ui";

export const Assistant = () => {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid h-dvh grid-cols-[250px_1fr] gap-x-4 px-4 py-4">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold mb-4">Chat-DB</h1>
          <p className="text-sm text-gray-500 mb-4">Database Assistant</p>
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
