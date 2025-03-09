import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines multiple class names into a single string using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date string to a human-readable format
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Truncates a string to a specified length and adds an ellipsis
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + "..."
}

/**
 * Determines if a SQL query is a read or write operation
 */
export function getQueryType(sql: string): "READ" | "WRITE" {
  const firstWord = sql.trim().toLowerCase().split(" ")[0]
  if (firstWord === "select") {
    return "READ"
  }
  return "WRITE"
}

/**
 * Extracts a title from a conversation
 */
export function extractTitleFromConversation(conversation: any[]): string {
  const firstUserMessage = conversation.find((m) => m.role === "user")?.content
  if (!firstUserMessage) return "New Conversation"
  
  return truncateString(firstUserMessage, 50)
}
