# Project PRD: Refined Conversational Agent with SQL Capabilities & ExternalStoreRuntime

## 1. Project Goal

Develop an application that uses assistant‑ui as its chat interface and Supabase as its persistent backend. Powered by the `gpt-4o` model, the assistant will function as a stateful conversational agent that not only handles natural language dialogue but also translates user requests into SQL queries for execution against a PostgreSQL database. Unlike the previous SQL-only prototype, this version delivers a rich, context-aware conversation experience while maintaining full SQL generation and CRUD capabilities.

## 2. Key Requirements

### 2.1. User Interface & Experience
- **Framework:**  
  - Build the frontend using [assistant‑ui](https://www.assistant-ui.com/docs) (React-based).
  - See gitingest for entire codebase at [docs\assistant-ui-assistant-ui.txt](docs\assistant-ui-assistant-ui.txt)
- **Conversational Agent:**  
  - Maintain context and conversation history across interactions and sessions.
  - Display natural language responses along with SQL query details and execution results.
- **Integrated SQL Capabilities:**  
  - Interpret natural language requests to generate and execute SQL queries.
  - Attach the executed SQL’s output to the assistant’s response.
  - For modifying operations (INSERT, UPDATE, DELETE, etc.), include a user confirmation step before execution.
- **State Management:**  
  - Utilize ExternalStoreRuntime to control and persist chat state in Supabase.

### 2.2. State Management with ExternalStoreRuntime
- **Custom External Store:**  
  - Implement state management using ExternalStoreRuntime as detailed in the assistant‑ui codebase.
  - Use the provided ExternalStoreAdapter (refer to `runtimes/external-store/ExternalStoreAdapter.tsx`) to bridge the chat UI and persistent state.
- **Message Conversion:**  
  - Implement a conversion function (inspired by `ThreadMessageConverter.ts` and `createMessageConverter.tsx`) to ensure all messages are in the `ThreadMessage` format.
- **Persistent Storage:**  
  - Synchronize the entire conversation state with Supabase so that data survives beyond local browser storage.
  - Use functions modeled after `save_conversation` and `load_conversations` (from your Streamlit prototype) for database operations.

### 2.3. Database Requirements (Supabase)
- **Backend Database:**  
  - Use Supabase as the persistent data store.
- **Flexible Table Schema:**  
  - Maintain the following tables and be open to modifications for optimal performance:
    - **Conversations Table:**  
      ```sql
      CREATE TABLE conversations (
          id SERIAL PRIMARY KEY,
          title TEXT,                 -- Auto-generated title (e.g., using a timestamp or summary)
          conversation TEXT,          -- JSON string storing the conversation (array of messages)
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ```
    - **Existing Domain Tables:**  
      - Keep existing tables (e.g., `pages`, `extracted2`, `entities`, and `page_entity_crosswalk` from [docs\prompt_resources.py](docs\prompt_resources.py)) intact for document and entity data.
    - **Additional Tables:**  
      - New tables may be created as needed to improve query performance or simplify data retrieval.

### 2.4. Assistant & Model Configuration
- **Model:**  
  - Use the `gpt-4o` model to interpret user inputs.
- **System Prompt & SQL Conversion:**  
  - Construct a system prompt that embeds the full database schema and sample queries (from prompt_resources.py) to guide SQL generation.
  - Follow the logic in the `convert_to_sql` function from [docs\chat_ui.py](docs\chat_ui.py) to generate, clean (using cleanup functions to remove code fences), and validate PostgreSQL queries.
- **Response Requirements:**  
  - Return natural language responses along with:
    - The generated SQL query.
    - The SQL execution output.
  - Enforce that the model’s temperature is set to 0 for deterministic output.
  - Trigger a confirmation step for any SQL operation that modifies the database.

### 2.5. Operational Capabilities
- **Natural Language & SQL Query Handling:**  
  - Recognize user requests that require SQL operations.
  - Differentiate between read operations (e.g., SELECT) and CRUD actions.
- **SQL Execution Feedback:**  
  - Execute SQL queries against Supabase.
  - Capture and attach query outputs to the assistant’s response using integrated tool-call feedback patterns (see `packages/assistant-stream/src/core/modules/tool-call.ts`).
- **CRUD Confirmation:**  
  - Require explicit user confirmation before executing any modifying operation.
- **Conversation Persistence:**  
  - Ensure that conversation history is saved to Supabase and can be reloaded in subsequent sessions.

## 3. Architecture & Workflow

### 3.1. End-to-End Workflow Diagram (Text-Based)
1. **User Input:**  
   - User submits a message via the assistant‑ui chat interface.
2. **Message Handling:**  
   - The message is captured by the ExternalStoreAdapter.
   - A conversion function transforms it into a `ThreadMessage` for uniformity.
3. **Processing:**  
   - The message is forwarded to the `gpt-4o` model with a system prompt that includes the schema and examples.
4. **SQL Detection & Generation:**  
   - If the input requires a SQL action, a SQL query is generated using logic similar to `convert_to_sql`.
   - The generated SQL is cleaned, validated, and if needed, flagged for CRUD confirmation.
5. **Execution & Feedback:**  
   - For read queries: The SQL is executed against Supabase and the results are captured.
   - For modifying queries: The system prompts the user for confirmation before execution.
   - The SQL output is appended to the natural language response.
6. **State Update & Persistence:**  
   - The new messages, SQL query, and results are saved to the conversation state.
   - The ExternalStoreAdapter synchronizes this state with the Supabase database.
7. **Display:**  
   - The combined response is rendered on the chat interface, and the conversation history is updated.

### 3.2. Detailed Workflow
- **User Interaction:**  
  - The chat UI (assistant‑ui) collects user messages.
- **State Management:**  
  - ExternalStoreAdapter (from `runtimes/external-store/ExternalStoreAdapter.tsx`) handles message storage.
  - Conversation data is formatted using conversion functions and synchronized with Supabase.
- **Processing:**  
  - The `gpt-4o` model processes the input using a detailed system prompt.
- **SQL Integration:**  
  - SQL queries are generated, cleaned, and validated.
  - For read operations, SQL is executed immediately with results attached.
  - For modifying operations, the assistant triggers a confirmation prompt before executing.
- **Response Assembly:**  
  - The final response contains both natural language explanation and SQL output.
- **Persistence & Feedback:**  
  - All interactions are saved in the `conversations` table, and detailed feedback (including errors) is logged.

## 4. Additional Considerations

### 4.1. Error Handling & Edge Cases
- **Error Scenarios:**  
  - If SQL generation fails or produces an invalid query, the assistant will return a clear error message.
  - Database connection issues must be caught and logged, and fallback messages displayed to the user.
  - CRUD operations without confirmation must be aborted with a notification.
- **Logging & Monitoring:**  
  - Integrate logging (via console or a logging service) to capture errors in SQL generation, query execution, and state synchronization.
  - Detailed logs will facilitate debugging and future enhancements.
- **Fallback Mechanisms:**  
  - In case of errors, the system should revert to the last known good state and prompt the user to retry.

### 4.2. Environment & Dependency Setup
- **Dependencies:**  
  - Node.js, React, assistant‑ui library, and any required packages as defined in the assistant‑ui repository.
  - Python (if leveraging prototype logic) with packages: streamlit, psycopg2, pandas, and OpenAI’s Python client.
- **Environment Variables:**  
  - `OPENAI_API_KEY` for accessing the GPT model.
  - Supabase connection variables: `SUPABASE_USER`, `SUPABASE_PASSWORD`, `SUPABASE_HOST`, `SUPABASE_PORT`, `SUPABASE_DBNAME`.
- **Setup Instructions:**  
  - Detailed setup instructions (e.g., in a README.md) should include dependency installation and environment configuration so developers can quickly replicate the environment.

### 4.3. API & Integration Contracts
- **ExternalStoreAdapter Interface:**  
  - Define explicit API methods (e.g., `getMessages()`, `updateMessage()`, `syncState()`) with clear input/output contracts.
  - Reference the implementation in `runtimes/external-store/ExternalStoreAdapter.tsx` for method signatures.
- **Conversion Function:**  
  - The `convertMessage` function must accept a custom message object (e.g., properties like `role`, `content`, `timestamp`) and output a valid `ThreadMessage` object.
- **SQL Generation & Execution:**  
  - The SQL conversion function should strictly return a valid SQL string starting with allowed commands (SELECT, WITH, INSERT, UPDATE, DELETE, etc.).
  - Clearly document expected behavior for CRUD operations and the confirmation step.

### 4.4. Testing & Validation Criteria
- **Acceptance Criteria:**  
  - The assistant correctly maintains conversation history across sessions.
  - SQL queries are generated accurately based on natural language requests.
  - Read queries return correct and formatted results.
  - Modifying queries (CRUD) require and display explicit user confirmation and confirmation messages upon execution.
  - **New Criterion:** Messages in the UI must contain the output of the executed SQL queries. For read queries, this includes the formatted results; for CRUD operations, this includes a clear confirmation that the operation was performed.
- **Unit Tests:**  
  - Test individual components such as the ExternalStoreAdapter, message conversion functions, and SQL cleanup functions.
- **Integration Tests:**  
  - Simulate end-to-end interactions—from user input through SQL generation, execution, and state persistence.
- **Sample Test Cases:**  
  - Verify that a SELECT query based on provided sample prompts returns the expected data.
  - Confirm that an invalid SQL generation triggers an error and does not alter the database.
  - Ensure that the confirmation workflow for CRUD operations functions as intended.