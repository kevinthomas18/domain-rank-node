

 DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users
(
    id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    name text COLLATE pg_catalog."default",
    email text COLLATE pg_catalog."default",
    password text COLLATE pg_catalog."default",
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
)

CREATE TABLE IF NOT EXISTS auth_users (
id integer NOT NULL DEFAULT nextval('auth_users_id_seq'::regclass),
    name text COLLATE pg_catalog."default" NOT NULL,
    email text COLLATE pg_catalog."default" NOT NULL,
    user_type text COLLATE pg_catalog."default" DEFAULT 'user'::text,
    created_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_id integer,
    status text COLLATE pg_catalog."default" DEFAULT 'active'::text,
    last_signin_date timestamp without time zone,
    otp text COLLATE pg_catalog."default",
    otp_expiry timestamp without time zone,
    CONSTRAINT auth_users_pkey PRIMARY KEY (id),
    CONSTRAINT auth_users_email_key UNIQUE (email),
    CONSTRAINT auth_users_user_type_check CHECK (user_type = ANY (ARRAY['manager'::text, 'user'::text])),
    CONSTRAINT auth_users_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]))
);

 DROP TABLE IF EXISTS projects;

CREATE TABLE IF NOT EXISTS projects
(
    id integer NOT NULL DEFAULT nextval('projects_id_seq'::regclass),
    name text COLLATE pg_catalog."default",
    domain_name text COLLATE pg_catalog."default",
    created_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer,
    last_used_date timestamp without time zone,
    status text COLLATE pg_catalog."default" DEFAULT 'Active'::text,
    CONSTRAINT projects_pkey PRIMARY KEY (id),
    CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.auth_users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT projects_updated_by_fkey FOREIGN KEY (updated_by)
        REFERENCES public.auth_users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT projects_status_check CHECK (status = ANY (ARRAY['Active'::text, 'Inactive'::text]))
)

 DROP TABLE IF EXISTS keywords;

CREATE TABLE IF NOT EXISTS keywords
(
    id integer NOT NULL DEFAULT nextval('keywords_id_seq'::regclass),
    project_id integer,
    keyword text COLLATE pg_catalog."default",
    search_location text COLLATE pg_catalog."default",
    search_engine text COLLATE pg_catalog."default" DEFAULT 'Google'::text,
    created_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    status text COLLATE pg_catalog."default" DEFAULT 'Active'::text,
    CONSTRAINT keywords_pkey PRIMARY KEY (id),
    CONSTRAINT keywords_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.auth_users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT keywords_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES public.projects (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT keywords_status_check CHECK (status = ANY (ARRAY['Active'::text, 'Inactive'::text]))
)

 DROP TABLE IF EXISTS rankhistory;

CREATE TABLE IF NOT EXISTS rankhistory
(
    id integer NOT NULL DEFAULT nextval('rankhistory_id_seq'::regclass),
    keyword_id integer,
    website_id integer,
    rank integer,
    checked_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT rankhistory_pkey PRIMARY KEY (id),
    CONSTRAINT rankhistory_keyword_id_fkey FOREIGN KEY (keyword_id)
        REFERENCES public.keywords (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

 DROP TABLE IF EXISTS websites;

CREATE TABLE IF NOT EXISTS websites
(
    id integer NOT NULL DEFAULT nextval('websites_id_seq'::regclass),
    project_id integer NOT NULL,
    website text COLLATE pg_catalog."default" NOT NULL,
    ownership_type text COLLATE pg_catalog."default" NOT NULL,
    website_type text COLLATE pg_catalog."default" NOT NULL,
    created_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer NOT NULL,
    status text COLLATE pg_catalog."default" DEFAULT 'Active'::text,
    CONSTRAINT websites_pkey PRIMARY KEY (id),
    CONSTRAINT websites_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.auth_users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT websites_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES public.projects (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT websites_status_check CHECK (status = ANY (ARRAY['Active'::text, 'Inactive'::text]))
)

 DROP TABLE IF EXISTS keyword_website_mapping;

CREATE TABLE IF NOT EXISTS keyword_website_mapping
(
    id integer NOT NULL DEFAULT nextval('keyword_website_mapping_id_seq'::regclass),
    keyword_id integer NOT NULL,
    website_id integer NOT NULL,
    latest_auto_search_rank integer,
    latest_manual_check_rank integer,
    last_check_date timestamp without time zone,
    CONSTRAINT keyword_website_mapping_pkey PRIMARY KEY (id),
    CONSTRAINT keyword_website_mapping_keyword_id_fkey FOREIGN KEY (keyword_id)
        REFERENCES public.keywords (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT keyword_website_mapping_website_id_fkey FOREIGN KEY (website_id)
        REFERENCES public.websites (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

 DROP TABLE IF EXISTS .site_audits;

CREATE TABLE IF NOT EXISTS site_audits
(
    id integer NOT NULL DEFAULT nextval('site_audits_id_seq'::regclass),
    audit_id integer NOT NULL,
    website_id integer NOT NULL,
    audit_date_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    audit_by integer NOT NULL,
    audit_status text COLLATE pg_catalog."default" DEFAULT 'Not started'::text,
    CONSTRAINT site_audits_pkey PRIMARY KEY (id),
    CONSTRAINT site_audits_website_id_fkey FOREIGN KEY (website_id)
        REFERENCES public.websites (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT site_audits_audit_status_check CHECK (audit_status = ANY (ARRAY['Not started'::text, 'In progress'::text, 'Completed'::text]))
)

 DROP TABLE IF EXISTS site_audit_pages;

CREATE TABLE IF NOT EXISTS site_audit_pages
(
    id integer NOT NULL DEFAULT nextval('site_audit_pages_id_seq'::regclass),
    audit_id integer NOT NULL,
    crawl_status text COLLATE pg_catalog."default" DEFAULT 'Not started'::text,
    url text COLLATE pg_catalog."default" NOT NULL,
    linked_from text COLLATE pg_catalog."default",
    page_size integer,
    response_time_ms integer,
    found_in_crawl boolean,
    found_in_sitemap boolean,
    found_in_analytics boolean,
    found_in_search_console boolean,
    meta_title text COLLATE pg_catalog."default",
    meta_description text COLLATE pg_catalog."default",
    meta_keywords text COLLATE pg_catalog."default",
    CONSTRAINT site_audit_pages_pkey PRIMARY KEY (id),
    CONSTRAINT fk_audit_id FOREIGN KEY (audit_id)
        REFERENCES public.site_audits (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT site_audit_pages_audit_id_fkey FOREIGN KEY (audit_id)
        REFERENCES public.site_audits (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT site_audit_pages_crawl_status_check CHECK (crawl_status = ANY (ARRAY['Not started'::text, 'Completed'::text]))
)

 DROP TABLE IF EXISTS site_audit_images;

CREATE TABLE IF NOT EXISTS site_audit_images
(
    id integer NOT NULL DEFAULT nextval('site_audit_images_id_seq'::regclass),
    audit_id integer NOT NULL,
    crawl_status text COLLATE pg_catalog."default" DEFAULT 'Not started'::text,
    image_url text COLLATE pg_catalog."default" NOT NULL,
    linked_from text COLLATE pg_catalog."default",
    image_size integer,
    alt_text text COLLATE pg_catalog."default",
    file_name text COLLATE pg_catalog."default",
    response_time_ms integer,
    CONSTRAINT site_audit_images_pkey PRIMARY KEY (id),
    CONSTRAINT fk_audit_id FOREIGN KEY (audit_id)
        REFERENCES public.site_audits (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT site_audit_images_audit_id_fkey FOREIGN KEY (audit_id)
        REFERENCES public.site_audits (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT site_audit_images_crawl_status_check CHECK (crawl_status = ANY (ARRAY['Not started'::text, 'Completed'::text]))
)

 DROP TABLE IF EXISTS scraping_jobs;

CREATE TABLE IF NOT EXISTS scraping_jobs
(
    id integer NOT NULL,
    url text COLLATE pg_catalog."default" NOT NULL,
    website_id integer NOT NULL,
    status text COLLATE pg_catalog."default" DEFAULT 'Not started'::text,
    progress numeric DEFAULT 0,
    result text COLLATE pg_catalog."default",
    errors text COLLATE pg_catalog."default",
    job_id text COLLATE pg_catalog."default",
    date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scraping_jobs_pkey PRIMARY KEY (id),
    CONSTRAINT scraping_jobs_website_id_fkey FOREIGN KEY (website_id)
        REFERENCES public.websites (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)


 DROP TABLE IF EXISTS analytics_accounts;

CREATE TABLE IF NOT EXISTS analytics_accounts
(
    id integer NOT NULL DEFAULT nextval('analytics_accounts_id_seq'::regclass),
    account_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    account_id character varying(255) COLLATE pg_catalog."default" NOT NULL,
    property_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    property_id character varying(255) COLLATE pg_catalog."default" NOT NULL,
    fetched_by character varying(255) COLLATE pg_catalog."default" NOT NULL,
    first_fetched_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer NOT NULL,
    CONSTRAINT analytics_accounts_pkey PRIMARY KEY (id)
)

 DROP TABLE IF EXISTS backlink_websites;

CREATE TABLE IF NOT EXISTS backlink_websites
(
    id integer NOT NULL DEFAULT nextval('backlink_websites_id_seq'::regclass),
    project_id integer NOT NULL,
    website_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    url text COLLATE pg_catalog."default" NOT NULL,
    user_id character varying(255) COLLATE pg_catalog."default",
    password character varying(255) COLLATE pg_catalog."default",
    remarks text COLLATE pg_catalog."default",
    created_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by character varying(255) COLLATE pg_catalog."default",
    CONSTRAINT backlink_websites_pkey PRIMARY KEY (id)
)

 DROP TABLE IF EXISTS backlinks;

CREATE TABLE IF NOT EXISTS backlinks
(
    id integer NOT NULL DEFAULT nextval('backlinks_id_seq'::regclass),
    project_id integer NOT NULL,
    link_from text COLLATE pg_catalog."default" NOT NULL,
    link_to text COLLATE pg_catalog."default" NOT NULL,
    anchor_text text COLLATE pg_catalog."default",
    do_follow boolean DEFAULT true,
    source character varying(50) COLLATE pg_catalog."default",
    link_type character varying(50) COLLATE pg_catalog."default",
    remarks text COLLATE pg_catalog."default",
    created_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by text COLLATE pg_catalog."default" NOT NULL,
    last_checked_date timestamp without time zone,
    CONSTRAINT backlinks_pkey PRIMARY KEY (id),
    CONSTRAINT backlinks_link_type_check CHECK (link_type::text = ANY (ARRAY['Text'::character varying, 'Image'::character varying, 'Button'::character varying, 'Video'::character varying]::text[])),
    CONSTRAINT backlinks_source_check CHECK (source::text = ANY (ARRAY['Manual'::character varying, 'Search Console'::character varying, 'Google Analytics'::character varying]::text[]))
)


 DROP TABLE IF EXISTS search_console_sites;

CREATE TABLE IF NOT EXISTS search_console_sites
(
    id integer NOT NULL DEFAULT nextval('search_console_sites_id_seq'::regclass),
    site_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    first_fetched_date date,
    fetched_by character varying(255) COLLATE pg_catalog."default",
    CONSTRAINT search_console_sites_pkey PRIMARY KEY (id),
    CONSTRAINT search_console_sites_site_name_key UNIQUE (site_name)
)

 DROP TABLE IF EXISTS settings;

CREATE TABLE IF NOT EXISTS settings
(
    key character varying(255) COLLATE pg_catalog."default" NOT NULL,
    value text COLLATE pg_catalog."default" NOT NULL,
    date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT settings_pkey PRIMARY KEY (key)
)
 DROP TABLE IF EXISTS websites_monitor;

CREATE TABLE IF NOT EXISTS websites_monitor
(
    id integer NOT NULL DEFAULT nextval('websites_monitor_id_seq'::regclass),
    site_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    url text COLLATE pg_catalog."default" NOT NULL,
    last_check_time timestamp without time zone,
    CONSTRAINT websites_monitor_pkey PRIMARY KEY (id)
)


 DROP TABLE IF EXISTS websites_monitor_history;

CREATE TABLE IF NOT EXISTS websites_monitor_history
(
    id integer NOT NULL DEFAULT nextval('websites_monitor_history_id_seq'::regclass),
    site_id integer,
    check_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(10) COLLATE pg_catalog."default",
    CONSTRAINT websites_monitor_history_pkey PRIMARY KEY (id),
    CONSTRAINT websites_monitor_history_site_id_fkey FOREIGN KEY (site_id)
        REFERENCES public.websites_monitor (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT websites_monitor_history_status_check CHECK (status::text = ANY (ARRAY['Success'::character varying, 'Fail'::character varying, 'Slow'::character varying]::text[]))
)
