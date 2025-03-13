import { ExternalStoreAdapter as ExternalStoreAdapterType } from '@assistant-ui/react';
import { ThreadMessage } from '@assistant-ui/react';
import { loadConversations, loadConversationById, saveConversation } from './supabase';

// Define the structure of our conversation state
export interface ConversationState {
  id?: number;
  title: string;
  messages: ThreadMessage[];
  created_at?: string;
}

// Create a message converter function to ensure all messages are in ThreadMessage format
export function convertToThreadMessage(message: any): ThreadMessage {
  // If it's already a ThreadMessage, return it
  if (message.id && message.role) {
    return message as ThreadMessage;
  }
  
  // Otherwise, convert it to a ThreadMessage
  return {
    id: message.id || crypto.randomUUID(),
    role: message.role || 'user',
    content: message.content || message.message || '',
    createdAt: message.createdAt || new Date().toISOString(),
  };
}

// Implementation of the ExternalStoreAdapter
export class ExternalStoreAdapter implements ExternalStoreAdapterType {
  private currentState: ConversationState = {
    title: 'New Conversation',
    messages: [],
  };

  // Initialize the adapter with an optional conversation ID
  constructor(conversationId?: number) {
    if (conversationId) {
      this.loadConversation(conversationId);
    }
  }

  // Load a specific conversation by ID
  private async loadConversation(id: number) {
    try {
      const conversation = await loadConversationById(id);
      this.currentState = {
        id: conversation.id,
        title: conversation.title,
        messages: Array.isArray(conversation.conversation) 
          ? conversation.conversation.map(convertToThreadMessage)
          : [],
        created_at: conversation.created_at,
      };
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  }

  // Get all messages from the current conversation
  async getMessages(): Promise<ThreadMessage[]> {
    return this.currentState.messages;
  }

  // Add a new message to the conversation
  async addMessage(message: ThreadMessage): Promise<void> {
    this.currentState.messages.push(message);
    await this.syncState();
  }

  // Update an existing message in the conversation
  async updateMessage(messageId: string, updatedMessage: Partial<ThreadMessage>): Promise<void> {
    const index = this.currentState.messages.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      this.currentState.messages[index] = {
        ...this.currentState.messages[index],
        ...updatedMessage,
      };
      await this.syncState();
    }
  }

  // Delete a message from the conversation
  async deleteMessage(messageId: string): Promise<void> {
    this.currentState.messages = this.currentState.messages.filter(msg => msg.id !== messageId);
    await this.syncState();
  }

  // Sync the current state with Supabase
  private async syncState(): Promise<void> {
    try {
      const result = await saveConversation(this.currentState.messages, this.currentState.title);
      if (result && result[0]) {
        this.currentState.id = result[0].id;
      }
    } catch (error) {
      console.error('Error syncing state:', error);
    }
  }

  // Get all saved conversations
  async getAllConversations(): Promise<ConversationState[]> {
    try {
      const conversations = await loadConversations();
      return conversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        messages: Array.isArray(conv.conversation) 
          ? conv.conversation.map(convertToThreadMessage)
          : [],
        created_at: conv.created_at,
      }));
    } catch (error) {
      console.error('Error loading all conversations:', error);
      return [];
    }
  }

  // Set the title of the current conversation
  async setTitle(title: string): Promise<void> {
    this.currentState.title = title;
    await this.syncState();
  }

  // Get the current conversation state
  getState(): ConversationState {
    return this.currentState;
  }
} 