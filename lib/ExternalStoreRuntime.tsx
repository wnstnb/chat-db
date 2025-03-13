"use client";

import { useCallback, useEffect, useState } from 'react';
import { useExternalStoreRuntime as useAssistantUIExternalStoreRuntime } from '@assistant-ui/react';
import { ThreadMessage } from '@assistant-ui/react';
import { loadConversations, loadConversationById, saveConversation } from './supabase';

// Define the structure of our conversation state
export interface ConversationState {
  id?: number;
  title: string;
  messages: ThreadMessage[];
  created_at?: string;
}

// Create a custom ExternalStoreRuntime
export function useSupabaseExternalStoreRuntime() {
  const [conversations, setConversations] = useState<ConversationState[]>([]);
  const [currentConversation, setCurrentConversation] = useState<ConversationState>({
    title: 'New Conversation',
    messages: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load all conversations on initial render
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setIsLoading(true);
        const data = await loadConversations();
        const formattedConversations = data.map(conv => ({
          id: conv.id,
          title: conv.title,
          messages: Array.isArray(conv.conversation) ? conv.conversation : [],
          created_at: conv.created_at,
        }));
        setConversations(formattedConversations);
      } catch (error) {
        console.error('Error loading conversations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
  }, []);

  // Load a specific conversation
  const loadConversation = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      const conversation = await loadConversationById(id);
      setCurrentConversation({
        id: conversation.id,
        title: conversation.title,
        messages: Array.isArray(conversation.conversation) ? conversation.conversation : [],
        created_at: conversation.created_at,
      });
    } catch (error) {
      console.error('Error loading conversation:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save the current conversation
  const saveCurrentConversation = useCallback(async () => {
    try {
      const result = await saveConversation(currentConversation.messages, currentConversation.title);
      if (result && result[0]) {
        setCurrentConversation(prev => ({
          ...prev,
          id: result[0].id,
        }));
        
        // Update the conversations list
        setConversations(prev => {
          const index = prev.findIndex(conv => conv.id === result[0].id);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = {
              ...currentConversation,
              id: result[0].id,
            };
            return updated;
          } else {
            return [
              {
                ...currentConversation,
                id: result[0].id,
              },
              ...prev,
            ];
          }
        });
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }, [currentConversation]);

  // Create a new conversation
  const createNewConversation = useCallback(() => {
    setCurrentConversation({
      title: 'New Conversation',
      messages: [],
    });
  }, []);

  // Add a message to the current conversation
  const addMessage = useCallback(async (message: ThreadMessage) => {
    setCurrentConversation(prev => ({
      ...prev,
      messages: [...prev.messages, message],
    }));
    
    // Save after adding the message
    await saveCurrentConversation();
  }, [saveCurrentConversation]);

  // Update a message in the current conversation
  const updateMessage = useCallback(async (messageId: string, updatedMessage: Partial<ThreadMessage>) => {
    setCurrentConversation(prev => {
      const index = prev.messages.findIndex(msg => msg.id === messageId);
      if (index === -1) return prev;
      
      const updatedMessages = [...prev.messages];
      updatedMessages[index] = {
        ...updatedMessages[index],
        ...updatedMessage,
      } as ThreadMessage;
      
      return {
        ...prev,
        messages: updatedMessages,
      };
    });
    
    // Save after updating the message
    await saveCurrentConversation();
  }, [saveCurrentConversation]);

  // Delete a message from the current conversation
  const deleteMessage = useCallback(async (messageId: string) => {
    setCurrentConversation(prev => ({
      ...prev,
      messages: prev.messages.filter(msg => msg.id !== messageId),
    }));
    
    // Save after deleting the message
    await saveCurrentConversation();
  }, [saveCurrentConversation]);

  // Set the title of the current conversation
  const setTitle = useCallback(async (title: string) => {
    setCurrentConversation(prev => ({
      ...prev,
      title,
    }));
    
    // Save after updating the title
    await saveCurrentConversation();
  }, [saveCurrentConversation]);

  // Create the adapter object
  const adapter = {
    getMessages: async () => currentConversation.messages,
    addMessage,
    updateMessage,
    deleteMessage,
    getAllConversations: async () => conversations,
    loadConversation,
    createNewConversation,
    setTitle,
    isLoading,
  };

  // Use the assistant-ui ExternalStoreRuntime with our adapter
  return useAssistantUIExternalStoreRuntime(adapter);
} 