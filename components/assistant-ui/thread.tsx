"use client";

import { FC } from "react";
import { SendHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";

export const Thread: FC = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-full flex-col items-center overflow-y-auto px-4 pt-8">
        <div className="mb-8 flex w-full max-w-2xl flex-col items-center gap-4 px-4 text-center">
          <h1 className="text-2xl font-semibold">Chat-DB Assistant</h1>
          <p className="max-w-md text-muted-foreground">
            Ask me questions about your data or request SQL operations. I can translate natural language to SQL and execute queries for you.
          </p>
        </div>

        {/* Messages would be rendered here */}
        
        <div className="min-h-8 flex-grow"></div>
      </div>

      <div className="sticky bottom-0 mt-3 flex w-full flex-col items-center justify-end rounded-t-lg bg-background pb-4 px-4">
        <div className="flex w-full max-w-2xl flex-row items-end gap-2 rounded-md border p-2 transition-colors">
          <textarea
            className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none"
            placeholder="Message..."
          />
          <Button
            className="size-8 shrink-0 rounded-md p-0"
            size="icon"
            variant="ghost"
          >
            <SendHorizontalIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}; 