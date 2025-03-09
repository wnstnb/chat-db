# Chat-DB: Database Assistant

Chat-DB is an application that utilizes assistant-ui to interact with a Supabase database. The assistant processes natural language requests, queries the database accordingly, and returns accurate, thoughtfully formatted results to users.

## Features

- Natural language interface for database queries
- Support for both read operations (queries) and write operations (CRUD)
- Conversation history persistence
- Well-formatted responses with tables and structured data
- Secure database operations with validation

## Tech Stack

- Next.js 15
- assistant-ui for the chat interface
- Supabase for database storage
- GPT-4o for natural language processing

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/chat-db.git
cd chat-db
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
Create a `.env.local` file with the following variables:
```
# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI configuration
OPENAI_API_KEY=your_openai_api_key
```

4. Set up the database
Run the SQL script in `db/setup.sql` in your Supabase SQL editor to create the necessary tables and functions.

5. Run the development server
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. Type a natural language query in the chat interface
2. The assistant will convert your query to SQL and execute it
3. Results will be displayed in a formatted manner
4. For write operations, the assistant will ask for confirmation before executing

### Example Queries

- "How many entities do we have in the DB?"
- "What are the different types of entities and their counts?"
- "Show me tax return data on Company XYZ for the last 3 years"
- "What is the insured property address for Company ABC's insurance?"
- "Update the entity name for entity_id 5 to 'New Company Name'"

## Project Structure

- `app/` - Next.js application files
- `components/` - React components
- `lib/` - Utility functions and database operations
- `db/` - Database setup scripts
- `docs/` - Documentation files

## License

This project is licensed under the MIT License - see the LICENSE file for details.
