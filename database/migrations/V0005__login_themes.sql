CREATE TABLE login_theme_state (
    id SMALLINT NOT NULL,
    active_theme VARCHAR(32) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    updated_by VARCHAR(64) NOT NULL,
    CONSTRAINT pk_login_theme_state PRIMARY KEY (id),
    CONSTRAINT ck_login_theme_state_singleton CHECK (id = 1),
    CONSTRAINT ck_login_theme_state_theme CHECK (active_theme IN ('neon-purple', 'tropical-blue', 'sunset-pink', 'cosmic-blue')),
    CONSTRAINT ck_login_theme_state_version CHECK (version >= 1)
);

CREATE TABLE login_theme_config (
    theme_id VARCHAR(32) NOT NULL,
    logo_text VARCHAR(24) NOT NULL,
    eyebrow VARCHAR(80) NOT NULL,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(300) NOT NULL,
    cta_text VARCHAR(64) NOT NULL,
    cta_visible BOOLEAN NOT NULL DEFAULT TRUE,
    institutional_text VARCHAR(160) NOT NULL DEFAULT '',
    institutional_url VARCHAR(512) NOT NULL DEFAULT '',
    primary_color CHAR(7) NOT NULL,
    secondary_color CHAR(7) NOT NULL,
    button_color CHAR(7) NOT NULL,
    glass_opacity SMALLINT NOT NULL,
    blur_pixels SMALLINT NOT NULL,
    card_opacity SMALLINT NOT NULL,
    glow_intensity SMALLINT NOT NULL,
    border_radius SMALLINT NOT NULL,
    decorations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    hero_asset VARCHAR(80) NOT NULL DEFAULT 'default',
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    updated_by VARCHAR(64) NOT NULL,
    CONSTRAINT pk_login_theme_config PRIMARY KEY (theme_id),
    CONSTRAINT ck_login_theme_config_theme CHECK (theme_id IN ('neon-purple', 'tropical-blue', 'sunset-pink', 'cosmic-blue')),
    CONSTRAINT ck_login_theme_config_colors CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$' AND secondary_color ~ '^#[0-9A-Fa-f]{6}$' AND button_color ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT ck_login_theme_config_ranges CHECK (glass_opacity BETWEEN 20 AND 96 AND blur_pixels BETWEEN 0 AND 24 AND card_opacity BETWEEN 35 AND 98 AND glow_intensity BETWEEN 0 AND 100 AND border_radius BETWEEN 6 AND 32 AND version >= 1),
    CONSTRAINT ck_login_theme_config_asset CHECK (hero_asset = 'default' OR hero_asset ~ '^[a-f0-9-]{36}\.(png|jpg)$')
);

CREATE TABLE login_theme_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    theme_id VARCHAR(32) NOT NULL,
    action VARCHAR(32) NOT NULL,
    configuration_version INTEGER NOT NULL,
    changed_by VARCHAR(64) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT pk_login_theme_history PRIMARY KEY (id),
    CONSTRAINT ck_login_theme_history_theme CHECK (theme_id IN ('neon-purple', 'tropical-blue', 'sunset-pink', 'cosmic-blue')),
    CONSTRAINT ck_login_theme_history_action CHECK (action IN ('activated', 'updated', 'restored', 'asset_uploaded')),
    CONSTRAINT ck_login_theme_history_version CHECK (configuration_version >= 1)
);

INSERT INTO login_theme_state (id, active_theme, updated_by)
VALUES (1, 'neon-purple', 'migration');

INSERT INTO login_theme_config (theme_id, logo_text, eyebrow, title, description, cta_text, cta_visible, institutional_text, institutional_url, primary_color, secondary_color, button_color, glass_opacity, blur_pixels, card_opacity, glow_intensity, border_radius, decorations_enabled, hero_asset, updated_by)
VALUES
    ('neon-purple', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#A855F7', '#EC4899', '#B237F5', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('tropical-blue', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#11C5E8', '#18A7D8', '#17B8EE', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('sunset-pink', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#F53F9A', '#F9735B', '#EF3A91', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('cosmic-blue', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#31B9FF', '#366AF7', '#36AFFF', 68, 14, 76, 72, 16, TRUE, 'default', 'migration');

GRANT SELECT, UPDATE ON login_theme_state TO habbux_phase2_app;
GRANT SELECT, UPDATE (logo_text, eyebrow, title, description, cta_text, cta_visible, institutional_text, institutional_url, primary_color, secondary_color, button_color, glass_opacity, blur_pixels, card_opacity, glow_intensity, border_radius, decorations_enabled, hero_asset, version, updated_at, updated_by) ON login_theme_config TO habbux_phase2_app;
GRANT INSERT ON login_theme_history TO habbux_phase2_app;
GRANT USAGE, SELECT ON SEQUENCE login_theme_history_id_seq TO habbux_phase2_app;
