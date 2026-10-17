CREATE SEQUENCE [ir_configuration_id_seq] AS INT START WITH 1;
CREATE TABLE ir_configuration (
    id INT NOT NULL CONSTRAINT [ir_configuration_id_def] DEFAULT (NEXT VALUE FOR [ir_configuration_id_seq]),
    language NVARCHAR(4000),
    hostname NVARCHAR(4000),
    CONSTRAINT [ir_configuration_pkey] PRIMARY KEY (id)
);
CREATE SEQUENCE [ir_model_id_seq] AS INT START WITH 1;
CREATE TABLE ir_model (
    id INT NOT NULL CONSTRAINT [ir_model_id_def] DEFAULT (NEXT VALUE FOR [ir_model_id_seq]),
    model NVARCHAR(4000) NOT NULL,
    name NVARCHAR(4000),
    info NVARCHAR(MAX),
    module NVARCHAR(4000),
    CONSTRAINT [ir_model_pkey] PRIMARY KEY (id)
);
CREATE SEQUENCE [ir_model_field_id_seq] AS INT START WITH 1;
CREATE TABLE ir_model_field (
    id INT NOT NULL CONSTRAINT [ir_model_field_id_def] DEFAULT (NEXT VALUE FOR [ir_model_field_id_seq]),
    model INTEGER,
    name NVARCHAR(4000) NOT NULL,
    relation NVARCHAR(4000),
    field_description NVARCHAR(4000),
    ttype NVARCHAR(4000),
    help NVARCHAR(MAX),
    module NVARCHAR(4000),
    [access] BIT,
    CONSTRAINT [ir_model_field_pkey] PRIMARY KEY (id),
    CONSTRAINT [ir_model_field_model_fkey] FOREIGN KEY (model) REFERENCES ir_model (id)
);
CREATE SEQUENCE [ir_ui_view_id_seq] AS INT START WITH 1;
CREATE TABLE ir_ui_view (
    id INT NOT NULL CONSTRAINT [ir_ui_view_id_def] DEFAULT (NEXT VALUE FOR [ir_ui_view_id_seq]),
    model NVARCHAR(4000) NOT NULL,
    [type] NVARCHAR(4000),
    data NVARCHAR(MAX) NOT NULL,
    field_childs NVARCHAR(4000),
    priority INTEGER NOT NULL,
    CONSTRAINT [ir_ui_view_pkey] PRIMARY KEY (id)
);
CREATE SEQUENCE [ir_ui_menu_id_seq] AS INT START WITH 1;
CREATE TABLE ir_ui_menu (
    id INT NOT NULL CONSTRAINT [ir_ui_menu_id_def] DEFAULT (NEXT VALUE FOR [ir_ui_menu_id_seq]),
    parent INTEGER,
    name NVARCHAR(4000) NOT NULL,
    icon NVARCHAR(4000),
    CONSTRAINT [ir_ui_menu_pkey] PRIMARY KEY (id),
    CONSTRAINT [ir_ui_menu_parent_fkey] FOREIGN KEY (parent) REFERENCES ir_ui_menu (id)
);
CREATE SEQUENCE [ir_translation_id_seq] AS INT START WITH 1;
CREATE TABLE ir_translation (
    id INT NOT NULL CONSTRAINT [ir_translation_id_def] DEFAULT (NEXT VALUE FOR [ir_translation_id_seq]),
    lang NVARCHAR(4000),
    src NVARCHAR(MAX),
    name NVARCHAR(4000) NOT NULL,
    res_id INTEGER,
    value NVARCHAR(MAX),
    [type] NVARCHAR(4000),
    module NVARCHAR(4000),
    fuzzy BIT NOT NULL,
    CONSTRAINT [ir_translation_pkey] PRIMARY KEY (id)
);
CREATE SEQUENCE [ir_lang_id_seq] AS INT START WITH 1;
CREATE TABLE ir_lang (
    id INT NOT NULL CONSTRAINT [ir_lang_id_def] DEFAULT (NEXT VALUE FOR [ir_lang_id_seq]),
    name NVARCHAR(4000) NOT NULL,
    code NVARCHAR(4000) NOT NULL,
    translatable BIT NOT NULL,
    parent NVARCHAR(4000),
    active BIT NOT NULL,
    direction NVARCHAR(4000) NOT NULL,
    CONSTRAINT [ir_lang_pkey] PRIMARY KEY (id)
);
CREATE SEQUENCE [res_user_id_seq] AS INT START WITH 1;
CREATE TABLE res_user (
    id INT NOT NULL CONSTRAINT [res_user_id_def] DEFAULT (NEXT VALUE FOR [res_user_id_seq]),
    name NVARCHAR(4000) NOT NULL,
    active BIT NOT NULL,
    login NVARCHAR(4000) NOT NULL,
    password NVARCHAR(4000),
    CONSTRAINT [res_user_pkey] PRIMARY KEY (id)
);
CREATE UNIQUE INDEX [res_user_login_key] ON res_user (login) WHERE login IS NOT NULL;
INSERT INTO res_user (id, login, password, name, active) VALUES (0, N'root', NULL, N'Root', 0);
CREATE SEQUENCE [res_group_id_seq] AS INT START WITH 1;
CREATE TABLE res_group (
    id INT NOT NULL CONSTRAINT [res_group_id_def] DEFAULT (NEXT VALUE FOR [res_group_id_seq]),
    name NVARCHAR(4000) NOT NULL,
    CONSTRAINT [res_group_pkey] PRIMARY KEY (id)
);
CREATE SEQUENCE [res_user-res_group_id_seq] AS INT START WITH 1;
CREATE TABLE [res_user-res_group] (
    id INT NOT NULL CONSTRAINT [res_user-res_group_id_def] DEFAULT (NEXT VALUE FOR [res_user-res_group_id_seq]),
    [user] INTEGER NOT NULL,
    [group] INTEGER NOT NULL,
    CONSTRAINT [res_user-res_group_user_fkey] FOREIGN KEY ([user]) REFERENCES res_user (id),
    CONSTRAINT [res_user-res_group_group_fkey] FOREIGN KEY ([group]) REFERENCES res_group (id),
    CONSTRAINT [res_user-res_group_pkey] PRIMARY KEY (id)
);
CREATE SEQUENCE [ir_module_id_seq] AS INT START WITH 1;
CREATE TABLE ir_module (
    id INT NOT NULL CONSTRAINT [ir_module_id_def] DEFAULT (NEXT VALUE FOR [ir_module_id_seq]),
    create_uid INTEGER NOT NULL,
    create_date DATETIME2(6) NOT NULL,
    write_date DATETIME2(6),
    write_uid INTEGER,
    name NVARCHAR(4000) NOT NULL,
    state NVARCHAR(4000),
    CONSTRAINT [ir_module_pkey] PRIMARY KEY (id),
    CONSTRAINT [ir_module_create_uid_fkey] FOREIGN KEY (create_uid) REFERENCES res_user (id),
    CONSTRAINT [ir_module_write_uid_fkey] FOREIGN KEY (write_uid) REFERENCES res_user (id)
);
CREATE UNIQUE INDEX [ir_module_name_uniq] ON ir_module (name) WHERE name IS NOT NULL;
CREATE SEQUENCE [ir_module_dependency_id_seq] AS INT START WITH 1;
CREATE TABLE ir_module_dependency (
    id INT NOT NULL CONSTRAINT [ir_module_dependency_id_def] DEFAULT (NEXT VALUE FOR [ir_module_dependency_id_seq]),
    create_uid INTEGER NOT NULL,
    create_date DATETIME2(6) NOT NULL,
    write_date DATETIME2(6),
    write_uid INTEGER,
    name NVARCHAR(4000),
    module INTEGER,
    CONSTRAINT [ir_module_dependency_pkey] PRIMARY KEY (id),
    CONSTRAINT [ir_module_dependency_create_uid_fkey] FOREIGN KEY (create_uid) REFERENCES res_user (id),
    CONSTRAINT [ir_module_dependency_write_uid_fkey] FOREIGN KEY (write_uid) REFERENCES res_user (id),
    CONSTRAINT [ir_module_dependency_module_fkey] FOREIGN KEY (module) REFERENCES ir_module (id)
);
CREATE SEQUENCE [ir_cache_id_seq] AS INT START WITH 1;
CREATE TABLE ir_cache (
    id INT NOT NULL CONSTRAINT [ir_cache_id_def] DEFAULT (NEXT VALUE FOR [ir_cache_id_seq]),
    name NVARCHAR(4000) NOT NULL,
    [timestamp] DATETIME2(6),
    CONSTRAINT [ir_cache_pkey] PRIMARY KEY (id)
);
