import os
import streamlit as st
import pandas as pd
import json
import re
from datetime import datetime
from openai import OpenAI
import psycopg2
import psycopg2.extras

# Initialize the OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Define the database schema for reference (for generating SQL queries)
SCHEMA = r"""
Table: pages(
    /* Table that stores raw information about each page in 
    a document and information on whether/how each page was classified */
    filename TEXT,          /* File name of the uploaded document */
    preprocessed TEXT,      /* File path of a page's final preprocessed image */
    page_number INTEGER,    /* Page number in the document */
    image_width REAL,       /* Width of the page image */
    image_height REAL,      /* Height of the page image */
    lines TEXT,             /* Extracted lines of text */
    words TEXT,             /* Extracted words */
    bboxes TEXT,            /* Bounding boxes of words */
    normalized_bboxes TEXT, /* Normalized bounding boxes */
    tokens TEXT,            /* Extracted tokens */
    words_for_clf TEXT,     /* Words used for classification */
    processing_time REAL,   /* Time taken for processing */
    clf_type TEXT,          /* Type of classifier used */
    page_label TEXT,        /* Predicted label for the page */
    page_confidence REAL,        /* Confidence score for the label */
    created_at DATETIME default current_timestamp /* Timestamp of creation */
)
Table: extracted2(
    /* Table stores extracted key-value pairs from the document
       and contains structured information extracted from the pages
       in the document. */
    key TEXT,           /* Designated key extracted from the page (e.g., first_name, gross_revenue, etc.) */
    value TEXT,         /* Extracted value corresponding to the key */
    filename TEXT,      /* Foreign key to pages.preprocessed */
    page_label TEXT,    /* Type of page -- correspondes to pages.page_label */
    page_confidence REAL, /* Confidence score of page_label -- correspondes to pages.page_confidence */
    page_num INTEGER,   /* Page number in the document */
    created_at DATETIME default current_timestamp /* Timestamp of creation */
)
Table: entities(
    /* Table to store unique person or business entities */
    entity_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT,         /* 'person' or 'business' */
    entity_name TEXT,         /* Full name or business name */
    additional_info TEXT,     /* JSON or additional metadata (e.g., normalized address, EIN, SSN) */
    created_at DATETIME default current_timestamp /* Timestamp of creation */
)
Table: page_entity_crosswalk(
    /* Table to link pages to entities (supports many-to-many relationships) */
    crosswalk_id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER,          /* Foreign key to pages (e.g., pages.id) */
    entity_id INTEGER,        /* Foreign key to entities (entities.entity_id) */
    created_at DATETIME default current_timestamp /* Timestamp of creation */
)
Table: conversations (
    id SERIAL PRIMARY KEY, 
    title TEXT,
    conversation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# --- Supabase Connection using psycopg2 ---
def get_connection():
    user = os.environ.get("SUPABASE_USER")
    password = os.environ.get("SUPABASE_PASSWORD")
    host = os.environ.get("SUPABASE_HOST")
    port = os.environ.get("SUPABASE_PORT", 5432)
    dbname = os.environ.get("SUPABASE_DBNAME")
    conn = psycopg2.connect(
        user=user,
        password=password,
        host=host,
        port=port,
        dbname=dbname
    )
    return conn

# --- Conversation Persistence Functions ---
def save_conversation(conversation, title="Conversation"):
    """Save a conversation (list of messages) to the database."""
    print(conversation)
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Convert the conversation to a JSON-serializable format
        # This ensures we're working with basic Python types that can be JSON serialized
        conversation_json = json.dumps(conversation)
        
        if title == "Conversation":
            title = f"Conversation on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        cursor.execute(
            "INSERT INTO conversations (title, conversation) VALUES (%s, %s)",
            (title, conversation_json)
        )
        conn.commit()
    except Exception as e:
        print(f"Error saving conversation: {e}")
        raise  # Re-raise the exception to propagate it to the caller
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            conn.close()

def load_conversations():
    """Load all saved conversations from the database."""
    conn = get_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)  # Use DictCursor for easier column access
    cursor.execute("SELECT id, title, conversation, created_at FROM conversations ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    conversations = []
    for row in rows:
        try:
            # Make sure we're properly parsing the JSON string
            conversation_data = None
            if isinstance(row['conversation'], str):
                conversation_data = json.loads(row['conversation'])
            else:
                # If it's already a dict/list, use it directly
                conversation_data = row['conversation']
            
            # Debug output
            print(f"Conversation {row['id']} loaded. Type: {type(conversation_data)}")
            
            # Format the created_at timestamp
            created_at = row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at'])
            
            conversations.append({
                "id": row['id'],
                "title": row['title'],
                "conversation": conversation_data,
                "created_at": created_at
            })
        except Exception as e:
            print(f"Error parsing conversation {row['id']}: {e}")
            import traceback
            traceback.print_exc()
    return conversations

# --- Helper Functions for SQL Conversion ---

def cleanup_sql_query(raw_query: str) -> str:
    # Remove triple backticks or any code fences
    cleaned = re.sub(r"```(?:sql)?", "", raw_query)
    cleaned = re.sub(r"```", "", cleaned)
    return cleaned.strip()

def convert_to_sql(nl_query: str, schema: str) -> str:
    examples = """
    Examples of valid queries:

    1) "Show me tax return data on Company XYZ for the last 3 years. Exclude balance sheet items."
    SELECT e.filename,
           e.key,
           e.value,
           e.page_label,
           p.created_at,
           ent.entity_name
    FROM extracted2 e
    JOIN pages p ON e.filename = p.preprocessed
    JOIN page_entity_crosswalk pc ON p.id = pc.page_id
    JOIN entities ent ON pc.entity_id = ent.entity_id
    WHERE ent.entity_name = 'Company XYZ'
      AND p.created_at >= DATE('now', '-3 years')
      AND e.page_label NOT IN ('1120S_bal_sheet', '1065_bal_sheet', '1120_bal_sheet')
    ORDER BY p.created_at DESC;

    2) "What is the insured property address for Company ABC's insurance?"
    SELECT DISTINCT e.filename,
           MAX(CASE WHEN e.key = 'property_address' THEN e.value END) AS property_address,
           ent.entity_name
    FROM extracted2 e
    JOIN pages p ON e.filename = p.preprocessed
    JOIN page_entity_crosswalk pc ON p.id = pc.page_id
    JOIN entities ent ON pc.entity_id = ent.entity_id
    WHERE ent.entity_name = 'Company ABC'
      AND e.page_label IN ('acord_28', 'acord_25')
    GROUP BY e.filename, ent.entity_name;

    3) "Does AAA Inc. have a lease? What are the lease terms on it?"
    SELECT e.filename,
           MAX(CASE WHEN e.key = 'lease_start_date' THEN e.value END) AS lease_start_date,
           MAX(CASE WHEN e.key = 'lease_end_date' THEN e.value END) AS lease_end_date,
           MAX(CASE WHEN e.key = 'term_length' THEN e.value END) AS term_length,
           ent.entity_name
    FROM extracted2 e
    JOIN pages p ON e.filename = p.preprocessed
    JOIN page_entity_crosswalk pc ON p.id = pc.page_id
    JOIN entities ent ON pc.entity_id = ent.entity_id
    WHERE ent.entity_name = 'AAA Inc.'
      AND e.page_label = 'lease_document'
    GROUP BY e.filename, ent.entity_name;

    4) "Who are the owners of MM Corp, and do we have drivers licenses for them?"
    WITH owners AS (
        SELECT DISTINCT e.filename,
               e.value AS owner_name
        FROM extracted2 e
        JOIN pages p ON e.filename = p.preprocessed
        JOIN page_entity_crosswalk pc ON p.id = pc.page_id
        JOIN entities ent ON pc.entity_id = ent.entity_id
        WHERE ent.entity_name = 'MM Corp'
          AND e.key = 'shareholder_name'
          AND e.page_label IN ('1120S_k1', '1065_k1')
    ),
    drivers AS (
        SELECT DISTINCT ent.entity_name AS person_name
        FROM extracted2 e
        JOIN pages p ON e.filename = p.preprocessed
        JOIN page_entity_crosswalk pc ON p.id = pc.page_id
        JOIN entities ent ON pc.entity_id = ent.entity_id
        WHERE e.page_label = 'drivers_license'
          AND ent.entity_type = 'person'
    )
    SELECT o.owner_name,
           CASE WHEN d.person_name IS NOT NULL THEN 'Yes' ELSE 'No' END AS has_drivers_license
    FROM owners o
    LEFT JOIN drivers d ON o.owner_name = d.person_name;

    5) "Do we have a certificate of good standing for JJ LLC?"
    SELECT e.filename,
           MAX(CASE WHEN e.key = 'business_name' THEN e.value END) AS business_name,
           MAX(CASE WHEN e.key = 'current_standing' THEN e.value END) AS current_standing,
           MAX(CASE WHEN e.key = 'date_incorporated' THEN e.value END) AS date_incorporated,
           ent.entity_name
    FROM extracted2 e
    JOIN pages p ON e.filename = p.preprocessed
    JOIN page_entity_crosswalk pc ON p.id = pc.page_id
    JOIN entities ent ON pc.entity_id = ent.entity_id
    WHERE ent.entity_name = 'JJ LLC'
      AND e.page_label = 'certificate_of_good_standing'
    GROUP BY e.filename, ent.entity_name;
    """

    prompt = f"""You are an expert data scientist specialized in SQL query generation. Analyze the provided PostgreSQL database schema and think step-by-step to produce precise and optimized SQL queries.

    Database Schema:
    {schema}

    Generate only valid PostgreSQL SQL queries (SELECT, CREATE, UPDATE, DELETE, DROP, etc.). For queries tagged as [complex query], carefully review the schema and consider joining multiple tables. Use information_schema for metadata queries when necessary.

    Examples:
    {examples}

    Write a SQL query to answer the following natural language request:
    \"\"\"{nl_query}\"\"\"

    Your answer must be a single, valid PostgreSQL SQL query with no additional commentary.
    """


    response = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="gpt-4o",
        temperature=0,
    )
    allowed_prefixes = (
        "select", 
        "with", 
        "insert", 
        "update", 
        "delete", 
        "create", 
        "drop", 
        "alter", 
        "desc", 
        "show",
        "pragma"
    )
    sql_query = response.choices[0].message.content.strip()
    print(sql_query)
    sql_query = cleanup_sql_query(sql_query)
    if not sql_query.lower().startswith(allowed_prefixes):
        raise ValueError("Generated query does not start with a valid SQL command. Aborting for safety.")
    return sql_query

def run_sql_query(query: str) -> pd.DataFrame:
    """Execute the given SQL query on the SQLite database and return the results as a DataFrame."""
    conn = get_connection()
    try:
        if query.strip().lower().startswith(("select", "with")):
            df = pd.read_sql_query(query, conn)
        else:
            cursor = conn.cursor()
            cursor.execute(query)
            conn.commit()
            df = pd.DataFrame({"result": ["Query executed successfully"]})
    except Exception as e:
        df = pd.DataFrame({"error": [str(e)]})
    finally:
        conn.close()
    return df

# # --- Main Chat UI ---
# st.info('This is a chat interface with the database, focused on answering questions using SQL.')
# # Sidebar: Display saved conversations
# st.sidebar.header("Saved Conversations")
# saved_conversations = load_conversations()
# conversation_titles = [conv["title"] for conv in saved_conversations]

# with st.sidebar:
#     clear_button = st.button("♻️ Clear Cache", type="primary")
#     if clear_button:
#         st.cache_data.clear()
#         st.success("Cache cleared!")

# selected_conv_title = st.sidebar.selectbox("Select a saved conversation", ["-- New Conversation --"] + conversation_titles)
# if selected_conv_title != "-- New Conversation --":
#     # Load the selected conversation into session_state
#     for conv in saved_conversations:
#         if conv["title"] == selected_conv_title:
#             st.session_state["chat_history"] = conv["conversation"]
#             break

# # Sidebar: Button to save current conversation
# if st.sidebar.button("Save Current Conversation"):
#     if "chat_history" in st.session_state and st.session_state["chat_history"]:
#         save_conversation(st.session_state["chat_history"])
#         st.sidebar.success("Conversation saved!")
#     else:
#         st.sidebar.warning("No conversation to save.")

# # Display chat history using Streamlit's chat message elements
# if "chat_history" not in st.session_state:
#     st.session_state["chat_history"] = []

# for message in st.session_state["chat_history"]:
#     role = message.get("role", "assistant")
#     content = message.get("message") or message.get("content") or ""
#     with st.chat_message(role):
#         st.markdown(content)

# # Get user input using the chat input widget
# user_input = st.chat_input("Enter your query about the documents...")
# if user_input:
#     # Append user message to chat history
#     st.session_state["chat_history"].append({"role": "user", "message": user_input})
#     with st.chat_message("user"):
#         st.markdown(user_input)
#     try:
#         with st.spinner("Generating SQL query..."):
#             sql_query = convert_to_sql(user_input, SCHEMA)
#         assistant_message = f"SQL Query: `{sql_query}`"
#         st.session_state["chat_history"].append({"role": "assistant", "message": assistant_message})
#         with st.chat_message("assistant"):
#             st.markdown(assistant_message)

#         # Check if the query is a CRUD operation and ask for confirmation
#         if sql_query.lower().startswith(("insert", "update", "delete", "create", "drop", "alter")):
#             st.session_state["pending_sql_query"] = sql_query
#             st.session_state["awaiting_confirmation"] = True
#             st.session_state["chat_history"].append({"role": "assistant", "message": "This operation will modify the database. Do you want to proceed? (yes/no)"})
#             with st.chat_message("assistant"):
#                 st.markdown("This operation will modify the database. Do you want to proceed? (yes/no)")
#         else:
#             with st.spinner("Running SQL query..."):
#                 result_df = run_sql_query(sql_query)
#             result_text = result_df.to_string(index=False)
#             result_message = f"Result:\n```\n{result_text}\n```"
#             st.session_state["chat_history"].append({"role": "assistant", "message": result_message})
#             with st.chat_message("assistant"):
#                 st.markdown(result_message)
#     except Exception as e:
#         error_message = f"Error generating SQL query: {e}"
#         st.session_state["chat_history"].append({"role": "assistant", "message": error_message})
#         with st.chat_message("assistant"):
#             st.markdown(error_message)

# # Handle confirmation input
# if "awaiting_confirmation" in st.session_state and st.session_state["awaiting_confirmation"]:
#     confirmation_input = st.chat_input("Please confirm the operation (yes/no):", key="confirmation")
#     if confirmation_input:
#         if confirmation_input.lower() == "yes":
#             with st.spinner("Running SQL query..."):
#                 result_df = run_sql_query(st.session_state["pending_sql_query"])
#             result_text = result_df.to_string(index=False)
#             result_message = f"Result:\n```\n{result_text}\n```"
#             st.session_state["chat_history"].append({"role": "assistant", "message": result_message})
#             with st.chat_message("assistant"):
#                 st.markdown(result_message)
#         else:
#             st.session_state["chat_history"].append({"role": "assistant", "message": "Operation cancelled by the user."})
#             with st.chat_message("assistant"):
#                 st.markdown("Operation cancelled by the user.")
#         st.session_state["awaiting_confirmation"] = False
#         st.session_state["pending_sql_query"] = None
#         st.rerun()  # Rerun the app to clear the confirmation input