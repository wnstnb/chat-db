import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  TextContentPart,
} from "@assistant-ui/react";
import type { FC } from "react";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import React from "react";

import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/markdown-text";
import { TooltipIconButton } from "@/components/tooltip-icon-button";

export const Thread: FC = () => {
  // Add a ref to track if the user is manually scrolling
  const userScrollingRef = React.useRef(false);
  // Add a ref to track if we're at the bottom of the scroll
  const isAtBottomRef = React.useRef(true);

  useEffect(() => {
    // Set up a MutationObserver to detect when new messages are added
    const messageContainer = document.getElementById('message-container');
    if (!messageContainer) return;
    
    const isAtBottom = () => {
      const threshold = 100; // pixels from bottom to consider "at bottom"
      const position = messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight;
      return position < threshold;
    };
    
    const scrollToBottom = () => {
      if (messageContainer && (isAtBottomRef.current || !userScrollingRef.current)) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }
    };
    
    // Handle scroll events to detect manual scrolling
    const handleScroll = () => {
      isAtBottomRef.current = isAtBottom();
      
      // If we're scrolling up, set userScrolling to true
      if (!isAtBottomRef.current) {
        userScrollingRef.current = true;
        console.log('User is scrolling up, disabling auto-scroll');
      }
      
      // If we manually scrolled to the bottom, reset userScrolling
      if (isAtBottomRef.current && userScrollingRef.current) {
        userScrollingRef.current = false;
        console.log('User scrolled to bottom, re-enabling auto-scroll');
      }
    };
    
    // Add scroll event listener
    messageContainer.addEventListener('scroll', handleScroll);
    
    // Create a MutationObserver to watch for changes in the message container
    const observer = new MutationObserver((mutations) => {
      // Check if any nodes were added
      const hasAddedNodes = mutations.some(mutation => 
        mutation.type === 'childList' && mutation.addedNodes.length > 0
      );
      
      if (hasAddedNodes) {
        console.log('New content detected in message container');
        // Only auto-scroll if we're at the bottom or not manually scrolling
        if (isAtBottomRef.current || !userScrollingRef.current) {
          console.log('Auto-scrolling to bottom');
          // Scroll immediately and after a short delay to ensure content is rendered
          scrollToBottom();
          setTimeout(scrollToBottom, 100);
        } else {
          console.log('Not auto-scrolling because user is viewing previous messages');
        }
      }
    });
    
    // Start observing the message container for changes
    observer.observe(messageContainer, { 
      childList: true,      // Watch for changes to the direct children
      subtree: true,        // Watch for changes in all descendants
      characterData: true   // Watch for changes to text content
    });
    
    // Clean up the observer and event listener when the component unmounts
    return () => {
      observer.disconnect();
      messageContainer.removeEventListener('scroll', handleScroll);
    };
  }, []);
  
  return (
    <ThreadPrimitive.Root
      className="bg-background box-border flex h-full flex-col overflow-hidden"
      style={{
        ["--thread-max-width" as string]: "42rem",
      }}
    >
      <ThreadPrimitive.Viewport className="flex flex-col h-full">
        {/* Scrollable message area */}
        <div className="flex-1 overflow-y-auto px-4 pt-8 pb-4 scroll-smooth" id="message-container">
          <div className="flex flex-col items-center">
            <ThreadWelcome />

            <ThreadPrimitive.Messages
              components={{
                UserMessage: UserMessage,
                EditComposer: EditComposer,
                AssistantMessage: AssistantMessage,
              }}
            />

            <ThreadPrimitive.If empty={false}>
              <div className="min-h-8 flex-grow" />
            </ThreadPrimitive.If>
          </div>
        </div>
        
        {/* Fixed input area */}
        <div className="w-full bg-background border-t border-border">
          <div className="relative max-w-[var(--thread-max-width)] mx-auto px-4 py-4">
            <ThreadScrollToBottom />
            <Composer />
          </div>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  const [isVisible, setIsVisible] = React.useState(false);
  
  useEffect(() => {
    const messageContainer = document.getElementById('message-container');
    if (!messageContainer) return;
    
    const checkScrollPosition = () => {
      const threshold = 200; // pixels from bottom to consider "at bottom"
      const position = messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight;
      setIsVisible(position > threshold);
    };
    
    // Check initial position
    checkScrollPosition();
    
    // Add scroll event listener
    messageContainer.addEventListener('scroll', checkScrollPosition);
    
    // Clean up
    return () => {
      messageContainer.removeEventListener('scroll', checkScrollPosition);
    };
  }, []);
  
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className={cn(
          "absolute -top-6 right-4 rounded-full bg-background shadow-md border-border transition-opacity duration-300",
          isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
        )}
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
        <div className="flex w-full flex-grow flex-col items-center justify-center">
          <h2 className="text-2xl font-bold mb-2">Welcome to Chat-DB</h2>
          <p className="mt-2 font-medium text-center max-w-md">
            I'm your database assistant. Ask me questions about your data, and I'll help you query and analyze it.
          </p>
          <p className="mt-4 text-sm text-gray-500 text-center max-w-md">
            You can ask questions like "How many entities do we have?" or "Show me tax return data for Company XYZ".
          </p>
        </div>
        <ThreadWelcomeSuggestions />
      </div>
    </ThreadPrimitive.Empty>
  );
};

const ThreadWelcomeSuggestions: FC = () => {
  return (
    <div className="mt-3 flex w-full items-stretch justify-center gap-4">
      <ThreadPrimitive.Suggestion
        className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
        prompt="How many entities do we have in the DB?"
        method="replace"
        autoSend
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          How many entities do we have in the DB?
        </span>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion
        className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
        prompt="What are the different types of entities and their counts?"
        method="replace"
        autoSend
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          What are the different types of entities and their counts?
        </span>
      </ThreadPrimitive.Suggestion>
    </div>
  );
};

const Composer: FC = () => {
  const handleFocus = () => {
    // Scroll to bottom when the input is focused, but only if not manually scrolling
    const messageContainer = document.getElementById('message-container');
    if (!messageContainer) return;
    
    // Check if we're already near the bottom
    const threshold = 100; // pixels from bottom to consider "at bottom"
    const position = messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight;
    const isAtBottom = position < threshold;
    
    // Only auto-scroll if we're already at the bottom
    if (isAtBottom) {
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
  };
  
  return (
    <ComposerPrimitive.Root className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-lg border bg-background px-2.5 shadow-sm transition-colors ease-in">
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        placeholder="Write a message..."
        className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
        onFocus={handleFocus}
      />
      <ComposerAction />
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send"
            variant="default"
            className="my-2.5 size-8 p-2 transition-opacity ease-in"
          >
            <SendHorizontalIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Cancel"
            variant="default"
            className="my-2.5 size-8 p-2 transition-opacity ease-in"
          >
            <CircleStopIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
};

const UserMessage: FC = () => {
  useEffect(() => {
    // Scroll to bottom when a user message is rendered, but only if not manually scrolling
    const scrollToBottom = () => {
      const messageContainer = document.getElementById('message-container');
      if (!messageContainer) return;
      
      // Check if we're near the bottom
      const threshold = 100; // pixels from bottom to consider "at bottom"
      const position = messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight;
      const isAtBottom = position < threshold;
      
      // Only auto-scroll if we're already at the bottom
      if (isAtBottom) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }
    };
    
    // Scroll immediately
    scrollToBottom();
  }, []);
  
  return (
    <MessagePrimitive.Root className="grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 [&:where(>*)]:col-start-2 w-full max-w-[var(--thread-max-width)] py-4">
      <UserActionBar />

      <div className="bg-muted text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words rounded-3xl px-5 py-2.5 col-start-2 row-start-2">
        <MessagePrimitive.Content />
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end col-start-1 row-start-2 mr-3 mt-2.5"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <ComposerPrimitive.Root className="bg-muted my-4 flex w-full max-w-[var(--thread-max-width)] flex-col gap-2 rounded-xl">
      <ComposerPrimitive.Input className="text-foreground flex h-8 w-full resize-none bg-transparent p-4 pb-0 outline-none" />

      <div className="mx-3 mb-3 flex items-center justify-center gap-2 self-end">
        <ComposerPrimitive.Cancel asChild>
          <Button variant="ghost">Cancel</Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button>Send</Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  useEffect(() => {
    console.log('AssistantMessage component rendered');
    
    // Scroll to bottom when a new message is rendered, but only if not manually scrolling
    const scrollToBottom = () => {
      const messageContainer = document.getElementById('message-container');
      if (!messageContainer) return;
      
      // Check if we're near the bottom
      const threshold = 100; // pixels from bottom to consider "at bottom"
      const position = messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight;
      const isAtBottom = position < threshold;
      
      // Only auto-scroll if we're already at the bottom
      if (isAtBottom) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }
    };
    
    // Scroll immediately and also after a short delay to ensure content is loaded
    // but only if we're already at the bottom
    scrollToBottom();
    const timeoutId = setTimeout(scrollToBottom, 100);
    
    // Additional check after content might have loaded
    const secondTimeoutId = setTimeout(scrollToBottom, 500);
    
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(secondTimeoutId);
    };
  }, []);
  
  return (
    <MessagePrimitive.Root className="grid grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] relative w-full max-w-[var(--thread-max-width)] py-4">
      <div className="text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words leading-7 col-span-2 col-start-2 row-start-1 my-1.5">
        <MessagePrimitive.Content 
          components={{ Text: MarkdownText }} 
        />
      </div>

      <AssistantActionBar />

      <BranchPicker className="col-start-2 row-start-2 -ml-2 mr-2" />
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="text-muted-foreground flex gap-1 col-start-3 row-start-2 -ml-1 data-[floating]:bg-background data-[floating]:absolute data-[floating]:rounded-md data-[floating]:border data-[floating]:p-1 data-[floating]:shadow-sm"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn("text-muted-foreground inline-flex items-center text-xs", className)}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      width="16"
      height="16"
    >
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};
