

 --DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT
);

 --DROP TABLE IF EXISTS auth_users;

CREATE TABLE IF NOT EXISTS auth_users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    user_type TEXT DEFAULT 'user' CHECK (user_type IN ('manager', 'user')),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_id INTEGER,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    last_signin_date TIMESTAMP,
    otp TEXT,
    otp_expiry TIMESTAMP
);

--DROP TABLE IF EXISTS projects;

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT,
    domain_name TEXT,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    last_used_date TIMESTAMP,
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.auth_users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT projects_updated_by_fkey FOREIGN KEY (updated_by)
        REFERENCES public.auth_users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

--DROP TABLE IF EXISTS keywords;

CREATE TABLE IF NOT EXISTS keywords (
    id SERIAL PRIMARY KEY,
    project_id INTEGER,
    keyword TEXT,
    search_location TEXT,
    search_engine TEXT DEFAULT 'Google',
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    CONSTRAINT keywords_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.auth_users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT keywords_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES public.projects (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

--DROP TABLE IF EXISTS rankhistory;

CREATE TABLE IF NOT EXISTS rankhistory (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER,
    website_id INTEGER,
    rank INTEGER,
    checked_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT rankhistory_keyword_id_fkey FOREIGN KEY (keyword_id)
        REFERENCES public.keywords (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

--DROP TABLE IF EXISTS websites;

CREATE TABLE IF NOT EXISTS websites (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    website TEXT NOT NULL,
    ownership_type TEXT NOT NULL,
    website_type TEXT NOT NULL,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL,
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    CONSTRAINT websites_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.auth_users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT websites_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES public.projects (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

--DROP TABLE IF EXISTS keyword_website_mapping;

CREATE TABLE IF NOT EXISTS keyword_website_mapping (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER NOT NULL,
    website_id INTEGER NOT NULL,
    latest_auto_search_rank INTEGER,
    latest_manual_check_rank INTEGER,
    last_check_date TIMESTAMP,
    CONSTRAINT keyword_website_mapping_keyword_id_fkey FOREIGN KEY (keyword_id)
        REFERENCES public.keywords (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT keyword_website_mapping_website_id_fkey FOREIGN KEY (website_id)
        REFERENCES public.websites (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

--DROP TABLE IF EXISTS site_audits;

CREATE TABLE IF NOT EXISTS site_audits (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL,
    website_id INTEGER NOT NULL,
    audit_date_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    audit_by INTEGER NOT NULL,
    audit_status TEXT DEFAULT 'Not started' CHECK (audit_status IN ('Not started', 'In progress', 'Completed')),
    CONSTRAINT site_audits_website_id_fkey FOREIGN KEY (website_id)
        REFERENCES public.websites (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

--DROP TABLE IF EXISTS site_audit_pages;

CREATE TABLE IF NOT EXISTS site_audit_pages (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL,
    crawl_status TEXT DEFAULT 'Not started' CHECK (crawl_status IN ('Not started', 'Completed')),
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
    CONSTRAINT fk_audit_id FOREIGN KEY (audit_id)
        REFERENCES public.site_audits (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

-- Drop and recreate site_audit_images table
--DROP TABLE IF EXISTS site_audit_images;

CREATE TABLE IF NOT EXISTS site_audit_images (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL,
    crawl_status TEXT DEFAULT 'Not started',
    image_url TEXT NOT NULL,
    linked_from TEXT,
    image_size INTEGER,
    alt_text TEXT,
    file_name TEXT,
    response_time_ms INTEGER,
    CONSTRAINT site_audit_images_crawl_status_check CHECK (crawl_status IN ('Not started', 'Completed')),
    CONSTRAINT site_audit_images_audit_id_fkey FOREIGN KEY (audit_id)
        REFERENCES public.site_audits (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

-- Drop and recreate scraping_jobs table
--DROP TABLE IF EXISTS scraping_jobs;

CREATE TABLE IF NOT EXISTS scraping_jobs (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    website_id INTEGER NOT NULL,
    status TEXT DEFAULT 'Not started',
    progress NUMERIC DEFAULT 0,
    result TEXT,
    errors TEXT,
    job_id TEXT,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scraping_jobs_website_id_fkey FOREIGN KEY (website_id)
        REFERENCES public.websites (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

-- Drop and recreate analytics_accounts table
--DROP TABLE IF EXISTS analytics_accounts;

CREATE TABLE IF NOT EXISTS analytics_accounts (
    id SERIAL PRIMARY KEY,
    account_name VARCHAR(255) NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    property_name VARCHAR(255) NOT NULL,
    property_id VARCHAR(255) NOT NULL,
    fetched_by VARCHAR(255) NOT NULL,
    first_fetched_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    project_id INTEGER NOT NULL
);

-- Drop and recreate backlink_websites table
--DROP TABLE IF EXISTS backlink_websites;

CREATE TABLE IF NOT EXISTS backlink_websites (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    website_name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    user_id VARCHAR(255),
    password VARCHAR(255),
    remarks TEXT,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- Drop and recreate backlinks table
--DROP TABLE IF EXISTS backlinks;

CREATE TABLE IF NOT EXISTS backlinks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    link_from TEXT NOT NULL,
    link_to TEXT NOT NULL,
    anchor_text TEXT,
    do_follow BOOLEAN DEFAULT TRUE,
    source VARCHAR(50),
    link_type VARCHAR(50),
    remarks TEXT,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    last_checked_date TIMESTAMP,
    CONSTRAINT backlinks_link_type_check CHECK (link_type IN ('Text', 'Image', 'Button', 'Video')),
    CONSTRAINT backlinks_source_check CHECK (source IN ('Manual', 'Search Console', 'Google Analytics'))
);

-- Drop and recreate search_console_sites table
--DROP TABLE IF EXISTS search_console_sites;

CREATE TABLE IF NOT EXISTS search_console_sites (
    id SERIAL PRIMARY KEY,
    site_name VARCHAR(255) NOT NULL UNIQUE,
    first_fetched_date DATE,
    fetched_by VARCHAR(255)
);
-- Drop and recreate settings table
--DROP TABLE IF EXISTS settings;

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT settings_pkey PRIMARY KEY (key)
);

-- Drop and recreate websites_monitor table
--DROP TABLE IF EXISTS websites_monitor;

CREATE TABLE IF NOT EXISTS websites_monitor (
    id SERIAL PRIMARY KEY,
    site_name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    last_check_time TIMESTAMP
);

-- Drop and recreate websites_monitor_history table
--DROP TABLE IF EXISTS websites_monitor_history;

CREATE TABLE IF NOT EXISTS websites_monitor_history (
    id SERIAL PRIMARY KEY,
    site_id INTEGER,
    check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(10),
    CONSTRAINT websites_monitor_history_site_id_fkey FOREIGN KEY (site_id)
        REFERENCES public.websites_monitor (id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT websites_monitor_history_status_check CHECK (status IN ('Success', 'Fail', 'Slow'))
);


-- -- Recreate tables
-- CREATE TABLE IF NOT EXISTS users (
--     id SERIAL PRIMARY KEY,
--     name TEXT,
--     email TEXT UNIQUE,
--     password TEXT
-- );

-- CREATE TABLE IF NOT EXISTS auth_users (
--     id SERIAL PRIMARY KEY,
--     name TEXT NOT NULL,
--     email TEXT UNIQUE NOT NULL,
--     user_type TEXT CHECK(user_type IN ('manager', 'user')) DEFAULT 'user',
--     created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     created_by_id INTEGER,
--     status TEXT CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
--     last_signin_date TIMESTAMP,
--     otp TEXT,
--     otp_expiry TIMESTAMP
-- );

-- CREATE TABLE IF NOT EXISTS projects (
--     id SERIAL PRIMARY KEY,
--     name TEXT,
--     domain_name TEXT,
--     created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     created_by INTEGER,
--     updated_by INTEGER,
--     last_used_date TIMESTAMP,
--     status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
--     FOREIGN KEY (created_by) REFERENCES auth_users(id),
--     FOREIGN KEY (updated_by) REFERENCES auth_users(id)
-- );

-- CREATE TABLE IF NOT EXISTS keywords (
--     id SERIAL PRIMARY KEY,
--     project_id INTEGER,
--     keyword TEXT,
--     search_location TEXT,
--     search_engine TEXT DEFAULT 'Google',
--     created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     created_by INTEGER,
--     status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
--     FOREIGN KEY (project_id) REFERENCES projects(id),
--     FOREIGN KEY (created_by) REFERENCES auth_users(id)
-- );

-- CREATE TABLE IF NOT EXISTS rankhistory (
--     id SERIAL PRIMARY KEY,
--     keyword_id INTEGER,
--     website_id INTEGER,
--     rank INTEGER,
--     checked_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     FOREIGN KEY (keyword_id) REFERENCES keywords(id)
-- );

-- CREATE TABLE IF NOT EXISTS websites (
--     id SERIAL PRIMARY KEY,
--     project_id INTEGER NOT NULL,
--     website TEXT NOT NULL,
--     ownership_type TEXT NOT NULL,
--     website_type TEXT NOT NULL,
--     created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     created_by INTEGER NOT NULL,
--     status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
--     FOREIGN KEY (project_id) REFERENCES projects(id),
--     FOREIGN KEY (created_by) REFERENCES auth_users(id)
-- );

-- CREATE TABLE IF NOT EXISTS keyword_website_mapping (
--     id SERIAL PRIMARY KEY,
--     keyword_id INTEGER NOT NULL,
--     website_id INTEGER NOT NULL,
--     latest_auto_search_rank INTEGER,
--     latest_manual_check_rank INTEGER,
--     last_check_date TIMESTAMP,
--     FOREIGN KEY (keyword_id) REFERENCES keywords(id),
--     FOREIGN KEY (website_id) REFERENCES websites(id)
-- );

-- CREATE TABLE IF NOT EXISTS Site_Audits (
--     id SERIAL PRIMARY KEY,
--     audit_id INTEGER NOT NULL,
--     website_id INTEGER NOT NULL,
--     audit_date_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     audit_by INTEGER NOT NULL,
--     audit_status TEXT CHECK(audit_status IN ('Not started', 'In progress', 'Completed')) DEFAULT 'Not started',
--     FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
-- );

-- CREATE TABLE IF NOT EXISTS Site_Audit_Pages (
--     id SERIAL PRIMARY KEY,
--     audit_id INTEGER NOT NULL,
--     crawl_status TEXT CHECK(crawl_status IN ('Not started', 'Completed')) DEFAULT 'Not started',
--     url TEXT NOT NULL,
--     linked_from TEXT,
--     page_size INTEGER,
--     response_time_ms INTEGER,
--     found_in_crawl BOOLEAN,
--     found_in_sitemap BOOLEAN,
--     found_in_analytics BOOLEAN,
--     found_in_search_console BOOLEAN,
--     meta_title TEXT,
--     meta_description TEXT,
--     meta_keywords TEXT,
--     FOREIGN KEY (audit_id) REFERENCES site_audits(id) ON DELETE CASCADE
-- );

-- CREATE TABLE IF NOT EXISTS Site_Audit_Images (
--     id SERIAL PRIMARY KEY,
--     audit_id INTEGER NOT NULL,
--     crawl_status TEXT CHECK(crawl_status IN ('Not started', 'Completed')) DEFAULT 'Not started',
--     image_url TEXT NOT NULL,
--     linked_from TEXT,
--     image_size INTEGER,
--     alt_text TEXT,
--     file_name TEXT,
--     response_time_ms INTEGER,
--     FOREIGN KEY (audit_id) REFERENCES site_audits(id) ON DELETE CASCADE
-- );

-- CREATE TABLE IF NOT EXISTS scraping_jobs (
--     id UUID PRIMARY KEY,
--     url TEXT NOT NULL,
--     website_id INTEGER NOT NULL,
--     status TEXT DEFAULT 'Not started',
--     progress NUMERIC DEFAULT 0,
--     result TEXT,
--     errors TEXT,
--     job_id TEXT,
--     FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
-- );
