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