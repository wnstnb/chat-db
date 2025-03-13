"use client";

import { FC } from "react";
import { ThreadListPrimitive } from "@assistant-ui/react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ThreadList: FC = () => {
  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <Button className="flex items-center justify-start gap-1 rounded-lg px-2.5 py-2 text-start" variant="ghost">
        <PlusIcon />
        New Thread
      </Button>
      <div className="mt-2">
        <h3 className="mb-2 px-2 text-sm font-medium">Recent Conversations</h3>
        {/* Conversations would be listed here */}
      </div>
    </div>
  );
}; 