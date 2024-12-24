

-- Recreate tables
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT
);

CREATE TABLE IF NOT EXISTS auth_users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    user_type TEXT CHECK(user_type IN ('manager', 'user')) DEFAULT 'user',
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_id INTEGER,
    status TEXT CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
    last_signin_date TIMESTAMP,
    otp TEXT,
    otp_expiry TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT,
    domain_name TEXT,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    last_used_date TIMESTAMP,
    status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
    FOREIGN KEY (created_by) REFERENCES auth_users(id),
    FOREIGN KEY (updated_by) REFERENCES auth_users(id)
);

CREATE TABLE IF NOT EXISTS keywords (
    id SERIAL PRIMARY KEY,
    project_id INTEGER,
    keyword TEXT,
    search_location TEXT,
    search_engine TEXT DEFAULT 'Google',
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (created_by) REFERENCES auth_users(id)
);

CREATE TABLE IF NOT EXISTS rankhistory (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER,
    website_id INTEGER,
    rank INTEGER,
    checked_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (keyword_id) REFERENCES keywords(id)
);

CREATE TABLE IF NOT EXISTS websites (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    website TEXT NOT NULL,
    ownership_type TEXT NOT NULL,
    website_type TEXT NOT NULL,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL,
    status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (created_by) REFERENCES auth_users(id)
);

CREATE TABLE IF NOT EXISTS keyword_website_mapping (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER NOT NULL,
    website_id INTEGER NOT NULL,
    latest_auto_search_rank INTEGER,
    latest_manual_check_rank INTEGER,
    last_check_date TIMESTAMP,
    FOREIGN KEY (keyword_id) REFERENCES keywords(id),
    FOREIGN KEY (website_id) REFERENCES websites(id)
);

CREATE TABLE IF NOT EXISTS Site_Audits (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL,
    website_id INTEGER NOT NULL,
    audit_date_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    audit_by INTEGER NOT NULL,
    audit_status TEXT CHECK(audit_status IN ('Not started', 'In progress', 'Completed')) DEFAULT 'Not started',
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Site_Audit_Pages (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL,
    crawl_status TEXT CHECK(crawl_status IN ('Not started', 'Completed')) DEFAULT 'Not started',
    url TEXT NOT NULL,
    linked_from TEXT,
    page_size INTEGER,
    response_time_ms INTEGER,
    found_in_crawl BOOLEAN,
    found_in_sitemap BOOLEAN,
    found_in_analytics BOOLEAN,
    found_in_search_console BOOLEAN,
    meta_title TEXT,
    meta_description TEXT,
    meta_keywords TEXT,
    FOREIGN KEY (audit_id) REFERENCES site_audits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Site_Audit_Images (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL,
    crawl_status TEXT CHECK(crawl_status IN ('Not started', 'Completed')) DEFAULT 'Not started',
    image_url TEXT NOT NULL,
    linked_from TEXT,
    image_size INTEGER,
    alt_text TEXT,
    file_name TEXT,
    response_time_ms INTEGER,
    FOREIGN KEY (audit_id) REFERENCES site_audits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scraping_jobs (
    id UUID PRIMARY KEY,
    url TEXT NOT NULL,
    website_id INTEGER NOT NULL,
    status TEXT DEFAULT 'Not started',
    progress INTEGER DEFAULT 0,
    result TEXT,
    errors TEXT,
    job_id TEXT,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
