CREATE TABLE hotel_settings (
    id SMALLINT NOT NULL,
    hotel_name VARCHAR(80) NOT NULL,
    motd VARCHAR(300) NOT NULL DEFAULT '',
    registrations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT pk_hotel_settings PRIMARY KEY (id),
    CONSTRAINT ck_hotel_settings_singleton CHECK (id = 1),
    CONSTRAINT ck_hotel_settings_name_length CHECK (char_length(btrim(hotel_name)) BETWEEN 1 AND 80),
    CONSTRAINT ck_hotel_settings_motd_length CHECK (char_length(motd) <= 300)
);

INSERT INTO hotel_settings (id, hotel_name, motd, registrations_enabled, maintenance_enabled)
VALUES (1, 'Habbux', 'Bem-vinda ao Habbux.', TRUE, FALSE);

GRANT SELECT, UPDATE (hotel_name, motd, registrations_enabled, maintenance_enabled, updated_at)
    ON hotel_settings TO habbux_phase2_app;
